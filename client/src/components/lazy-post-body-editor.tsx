import { lazy } from "react";

export const LazyPostBodyEditor = lazy(() =>
  import("./post-body-editor").then((module) => ({ default: module.PostBodyEditor })),
);
