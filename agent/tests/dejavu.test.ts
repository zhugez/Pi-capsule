import { test, expect } from "bun:test";
import dejavuExtension from "../extensions/dejavu";

test("keeps hostnames intact across input and tool results", async () => {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const pi = {
    on: (name: string, handler: (...args: any[]) => any) => { handlers[name] = handler; },
    registerCommand: () => {},
  };
  dejavuExtension(pi as any);
  const ctx = { hasUI: false };
  const url = "https://service.example.org/v1/chat/completions";
  const input = `connect ${url} and bare.example.net`;
  const result = await handlers.input({ text: input }, ctx);
  expect(result.action === "continue" ? input : result.text).toBe(input);

  const message = { role: "user", content: [{ type: "text", text: input }] };
  expect(await handlers.context({ messages: [message] })).toBeUndefined();
  expect(await handlers.tool_result({ toolName: "read", content: [{ type: "text", text: input }] }, ctx)).toBeUndefined();
  const mixed = await handlers.input({ text: `scan ${url} with nmap` }, ctx);
  expect(mixed.action).toBe("transform");
  expect(mixed.text).toContain(url);
  expect(mixed.text).toContain("nmap [canonical:");
});
