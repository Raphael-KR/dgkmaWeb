import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicHomePath = new URL("../client/src/pages/public-home.tsx", import.meta.url);

test("공개 홈페이지 회원 구성 표는 모바일에서 부모 grid 폭을 넓히지 않는다", async () => {
  const source = await readFile(publicHomePath, "utf8");

  assert.match(
    source,
    /<Card className="sm:col-span-2 min-w-0">[\s\S]*?<table className="w-full text-sm min-w-\[420px\]">/,
  );
});
