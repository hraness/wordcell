"use client";

import { SocialKitPanel } from "@hraness/design-kit/react";

import { socialKit } from "../../wordcell/launch/beats";

/** The launch posts for X, Bluesky, Threads and LinkedIn, cut from the beats, with copy buttons. */
export function SocialKitDetails() {
  return <SocialKitPanel kit={socialKit} summary="Share this launch: posts for X, Bluesky, Threads and LinkedIn" />;
}
