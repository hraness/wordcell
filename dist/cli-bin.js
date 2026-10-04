#!/usr/bin/env bun
// @bun
import {
  runWordcellBin
} from "./index-82r6g4py.js";
import"./index-3t0v457d.js";
import"./index-8pabwzqg.js";
import"./index-4knsp9qj.js";
import"./index-z1w83f81.js";

// src/cli-bin.ts
import { fileURLToPath } from "url";
if (import.meta.main)
  process.exitCode = await runWordcellBin("wordcell", fileURLToPath(import.meta.url), process.argv.slice(2));
