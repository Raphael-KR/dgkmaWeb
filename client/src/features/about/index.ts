import { lazy } from "react";

export const AboutIntro = lazy(() => import("./intro"));
export const AboutExecutives = lazy(() => import("./executives"));
export const AboutPresidents = lazy(() => import("./presidents"));
export const AboutHeritage = lazy(() => import("./heritage"));
export const AboutHistoricalOfficers = lazy(() => import("./heritage/officers"));
export const AboutAwards = lazy(() => import("./heritage/awards"));
export const AboutDonations = lazy(() => import("./heritage/donations"));
export const AboutAlbums = lazy(() => import("./heritage/albums"));
export const AboutBylaws = lazy(() => import("./bylaws"));
export const AboutRegulations = lazy(() => import("./regulations"));
export const AboutJoin = lazy(() => import("./join"));
export const AboutDues = lazy(() => import("./dues"));
export const AboutCondolence = lazy(() => import("./condolence"));
