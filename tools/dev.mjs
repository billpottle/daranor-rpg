#!/usr/bin/env node

import { build } from "./build.mjs";

build();
await import("./serve.mjs");
