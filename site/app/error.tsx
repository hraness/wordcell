"use client";

import { Button } from "@hraness/ui";
import { SiteExceptionAnalytics } from "./site-analytics";

export default function ErrorPage({ error, reset }: Readonly<{ error: Error; reset: () => void }>) {
  return <main><SiteExceptionAnalytics error={error} /><h1>This page could not load</h1><Button onPress={reset}>Try again</Button></main>;
}
