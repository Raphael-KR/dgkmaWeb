import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";

// Execute the real router, lazy entrypoints and AuthGate with inert screen
// bodies/auth state. No login bypass is added to the app or server.
test("lazy routing preserves public, member and administrator access", async () => {
  const screens = new Map<string, string>();
  const root = resolve("client/src/features");
  for (const feature of readdirSync(root)) {
    const entry = resolve(root, feature, feature === "events" ? "index.tsx" : "index.ts");
    const source = readFileSync(entry, "utf8");
    for (const match of source.matchAll(/import\("(.+?)"\)/g)) {
      screens.set(resolve(dirname(entry), `${match[1]}.tsx`), `${feature}/${match[1].slice(2)}`);
    }
  }
  const output = await build({
    stdin: {
      contents: `
        import React from "react";
        import { renderToPipeableStream } from "react-dom/server";
        import { PassThrough } from "node:stream";
        import { Router as LocationRouter } from "wouter";
        import { Router } from "./client/src/app/routing/router";
        import { setAuth } from "./client/src/features/auth/hooks/use-auth";
        export async function render(path, user, isLoading = false) {
          setAuth({user, isLoading});
          return new Promise((resolve, reject) => {
            const sink = new PassThrough();
            let html = "";
            sink.on("data", chunk => html += chunk);
            sink.on("end", () => resolve(html));
            const stream = renderToPipeableStream(
              <LocationRouter hook={() => [path, () => {}]}><Router /></LocationRouter>,
              { onAllReady() { stream.pipe(sink); }, onError: reject }
            );
          });
        }`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic",
    external: ["react", "react-dom/server", "react/jsx-runtime"],
    plugins: [{
      name: "inert-screens",
      setup(builder) {
        builder.onLoad({ filter: /features\/.*\.tsx?$/ }, args => {
          if (args.path.endsWith("/auth/hooks/use-auth.tsx")) return {
            contents: `let auth; export const setAuth = value => auth = value;
              export const useAuth = () => auth;
              export const AuthProvider = ({children}) => children;`,
            loader: "jsx",
          };
          if (args.path.endsWith("/auth/components/login-modal.tsx")) return {
            contents: "export const LoginModal = () => null;", loader: "jsx",
          };
          if (args.path.endsWith("/home/public-home.tsx")) return {
            contents: 'export const PublicHome = () => <p>screen:public-home</p>;', loader: "jsx",
          };
          const screen = screens.get(args.path);
          if (screen) return {
            contents: `export default () => <p>screen:${screen}</p>;`, loader: "jsx",
          };
        });
      },
    }],
  });
  const module = { exports: {} as { render: (path: string, user: unknown, loading?: boolean) => Promise<string> } };
  new Function("require", "module", "exports", output.outputFiles[0].text)(
    createRequire(import.meta.url), module, module.exports,
  );
  const render = module.exports.render;
  const member = { isAdmin: false };
  assert.match(await render("/", null), /screen:public-home/);
  assert.match(await render("/", member), /screen:home\/home/);
  assert.doesNotMatch(await render("/", null, true), /screen:/);
  const publicRoutes = {
    "/login": "auth/login", "/kakao-callback": "auth/kakao-callback",
    "/onboarding/region": "auth/onboarding/region", "/terms": "legal/terms", "/privacy": "legal/privacy",
    "/about/intro": "about/intro", "/about/executives": "about/executives",
    "/about/bylaws": "about/bylaws", "/about/bylaws/regulations": "about/regulations",
    "/about/join": "about/join", "/about/dues": "about/dues", "/about/condolence": "about/condolence",
  };
  for (const [path, screen] of Object.entries(publicRoutes)) {
    assert.ok((await render(path, null)).includes(`screen:${screen}`), path);
  }
  const memberRoutes = {
    "/b": "boards/boards", "/p/123": "boards/post-detail", "/post/123": "boards/post-detail",
    "/directory": "directory/directory", "/profile": "profile/profile",
    "/heritage": "heritage/heritage", "/search": "search/search",
    "/events": "events/page", "/events/123": "events/detail", "/o/123": "events/obituary/detail",
  };
  for (const [path, screen] of Object.entries(memberRoutes)) {
    const anonymous = await render(path, null);
    assert.match(anonymous, /로그인이 필요한 메뉴입니다/);
    assert.doesNotMatch(anonymous, /screen:/);
    assert.ok((await render(path, member)).includes(`screen:${screen}`), path);
    assert.doesNotMatch(await render(path, member, true), /screen:/);
  }
  assert.match(await render("/admin", null), /로그인이 필요한 메뉴입니다/);
  assert.match(await render("/admin", member), /접근 권한이 없습니다/);
  assert.match(await render("/admin", { isAdmin: true }), /screen:admin\/admin/);
});

test("legacy redirects retain targets, compose query and replacement behavior", () => {
  const source = readFileSync("client/src/app/routing/router.tsx", "utf8");
  for (const [path, target] of Object.entries({
    "/about": "/heritage", "/info": "/heritage", "/history": "/heritage",
    "/executives": "/about/executives", "/officers": "/about/executives", "/bylaws": "/about/bylaws",
  })) {
    assert.ok(source.includes(`path="${path}" component={() => { window.location.href = '${target}'`));
  }
  assert.match(source, /path="\/o\/new".*to="\/events\?type=obituary&compose=1" replace/);
  assert.match(source, /path="\/o".*to="\/events\?type=obituary" replace/);
  assert.ok(source.indexOf('path="/o/new"') < source.indexOf('path="/o/:id"'));
});

test("pending screens show status; failed screens offer an explicit full reload", async () => {
  const output = await build({
    stdin: {
      contents: `
        import React, { lazy } from "react";
        import { renderToString } from "react-dom/server";
        import { RouteBoundary, RouteErrorBoundary } from "./client/src/app/routing/route-boundary";
        export function verify() {
          const Pending = lazy(() => new Promise(() => {}));
          const pending = renderToString(<RouteBoundary routeKey="/events"><Pending /></RouteBoundary>);
          const boundary = new RouteErrorBoundary({ children: <p>loaded</p> });
          const loaded = renderToString(boundary.render());
          boundary.state = RouteErrorBoundary.getDerivedStateFromError(new Error("private detail"));
          const failed = renderToString(boundary.render());
          return { pending, loaded, failed,
            firstKey: RouteBoundary({routeKey: "/events", children: null}).key,
            nextKey: RouteBoundary({routeKey: "/login", children: null}).key };
        }`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic",
    external: ["react", "react-dom/server", "react/jsx-runtime"],
  });
  const module = { exports: {} as { verify: () => Record<string, string> } };
  new Function("require", "module", "exports", output.outputFiles[0].text)(
    createRequire(import.meta.url), module, module.exports,
  );
  const result = module.exports.verify();
  assert.match(result.pending, /role="status"/);
  assert.match(result.pending, /화면을 불러오는 중입니다/);
  assert.match(result.loaded, /loaded/);
  assert.match(result.failed, /role="alert"/);
  assert.match(result.failed, /새로고침/);
  assert.match(result.failed, /href="\/"/);
  assert.doesNotMatch(result.failed, /private detail/);
  assert.notEqual(result.firstKey, result.nextKey);
  const source = readFileSync("client/src/app/routing/route-boundary.tsx", "utf8");
  assert.match(source, /onClick=\{\(\) => window.location.reload\(\)\}/);
  assert.equal((source.match(/window.location.reload/g) ?? []).length, 1);
});
