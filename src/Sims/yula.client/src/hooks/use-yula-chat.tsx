"use client";

import * as React from "react";
import { YulaChatContext } from "./yula-chat-context";

export function useYulaChat() {
  const ctx = React.useContext(YulaChatContext);
  if (!ctx) {
    throw new Error("useYulaChat must be used within <YulaChatProvider>");
  }
  return ctx;
}
