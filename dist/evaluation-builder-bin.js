#!/usr/bin/env bun
// @bun
import {
  runWordcellBin
} from "./index-6jz050v0.js";
import"./index-3t0v457d.js";
import"./index-8pabwzqg.js";
import"./index-4knsp9qj.js";
import"./index-z1w83f81.js";

// src/evaluation-builder-bin.ts
import { fileURLToPath } from "url";
if (import.meta.main)
  process.exitCode = await runWordcellBin("wordcell-evaluation-builder", fileURLToPath(import.meta.url), process.argv.slice(2));
