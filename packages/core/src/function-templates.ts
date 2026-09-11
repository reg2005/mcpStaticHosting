export const LEAD_FUNCTION_TS = `// Local backend endpoint: POST /api/lead
// Validates a simple lead form, saves it to ctx.data JSON storage and can
// optionally forward the lead to a webhook stored in ctx.env.LEAD_WEBHOOK_URL.
import {
  type McpHostingFunctionCtx,
  type ValidationErrors,
  cleanString,
  json,
  minLength,
  parseJsonBody,
  validEmail,
} from "../lib/validation.ts";

interface LeadPayload {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  message?: unknown;
}

interface Lead {
  name: string;
  email: string;
  phone: string;
  message: string;
}

export default async function handler(req: Request, ctx: McpHostingFunctionCtx): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = await parseJsonBody<LeadPayload>(req);
  if (!body.ok) return json({ ok: false, errors: { form: body.error } }, 400);

  const lead: Lead = {
    name: cleanString(body.data.name),
    email: cleanString(body.data.email).toLowerCase(),
    phone: cleanString(body.data.phone),
    message: cleanString(body.data.message),
  };

  const errors: ValidationErrors = {};
  if (!minLength(lead.name, 2)) errors.name = "Name must be at least 2 characters";
  if (!validEmail(lead.email)) errors.email = "Enter a valid email";
  if (lead.phone && !/^[+()\\-\\s\\d]{7,24}$/.test(lead.phone)) {
    errors.phone = "Use digits, spaces, +, -, or parentheses";
  }
  if (!minLength(lead.message, 10)) errors.message = "Message must be at least 10 characters";
  if (Object.keys(errors).length > 0) return json({ ok: false, errors }, 422);

  const record = await ctx.data.insert("leads", lead, {
    source: "lead-form",
    userAgent: req.headers.get("user-agent"),
  });

  if (ctx.env.LEAD_WEBHOOK_URL) {
    await fetch(ctx.env.LEAD_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: record.id, ...lead }),
    });
  }

  return json({ ok: true, id: record.id, status: "received" });
}
`;

export const VALIDATION_TS = `export interface McpHostingKV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { ttlSeconds?: number }): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string): Promise<number>;
}

export interface McpHostingDataRecord<T = unknown> {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "new" | "processing" | "done" | "rejected";
  data: T;
  meta?: Record<string, unknown>;
}

export interface McpHostingDataStore {
  insert<T>(collection: string, data: T, meta?: Record<string, unknown>): Promise<McpHostingDataRecord<T>>;
  list<T = unknown>(collection: string, opts?: { limit?: number; offset?: number }): Promise<McpHostingDataRecord<T>[]>;
  get<T = unknown>(collection: string, id: string): Promise<McpHostingDataRecord<T> | null>;
}

export interface McpHostingFunctionCtx {
  env: Record<string, string>;
  params: Record<string, string>;
  kv: McpHostingKV;
  data: McpHostingDataStore;
}

export type ValidationErrors = Record<string, string>;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function minLength(value: string, min: number): boolean {
  return value.trim().length >= min;
}

export function validEmail(value: string): boolean {
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value);
}

export async function parseJsonBody<T>(req: Request): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: (await req.json()) as T };
  } catch {
    return { ok: false, error: "Send a valid JSON body" };
  }
}
`;

export const LEAD_FORM_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lead form</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif; background: #101419; color: #edf2f7; }
      form { width: min(420px, calc(100vw - 32px)); display: grid; gap: 12px; }
      label { display: grid; gap: 5px; font-size: 13px; color: #aeb8c5; }
      input, textarea, button { font: inherit; border-radius: 7px; }
      input, textarea { border: 1px solid #2b3542; background: #171d24; color: #edf2f7; padding: 10px 12px; }
      .field { display: grid; gap: 5px; }
      .field.has-error input, .field.has-error textarea { border-color: #ff8a8a; }
      .field-error { min-height: 16px; color: #ff8a8a; font-size: 12px; }
      textarea { min-height: 120px; resize: vertical; }
      button { border: 0; background: #2f80ed; color: white; padding: 11px 14px; font-weight: 700; cursor: pointer; }
      button[disabled] { opacity: .65; cursor: wait; }
      .status { min-height: 20px; font-size: 13px; color: #77d991; }
      .error { color: #ff8a8a; }
    </style>
  </head>
  <body>
    <form id="leadForm" novalidate>
      <h1>Send a request</h1>
      <div class="field" data-field="name">
        <label>Name<input name="name" autocomplete="name" /></label>
        <div class="field-error" id="nameError"></div>
      </div>
      <div class="field" data-field="email">
        <label>Email<input name="email" type="email" autocomplete="email" /></label>
        <div class="field-error" id="emailError"></div>
      </div>
      <div class="field" data-field="phone">
        <label>Phone<input name="phone" autocomplete="tel" /></label>
        <div class="field-error" id="phoneError"></div>
      </div>
      <div class="field" data-field="message">
        <label>Message<textarea name="message"></textarea></label>
        <div class="field-error" id="messageError"></div>
      </div>
      <button id="leadSubmit">Send</button>
      <div class="status" id="status"></div>
    </form>
    <script>
      const form = document.querySelector("#leadForm");
      const submit = document.querySelector("#leadSubmit");
      const status = document.querySelector("#status");
      const fields = ["name", "email", "phone", "message"];

      function clearErrors() {
        for (const field of fields) {
          const wrap = form.querySelector('[data-field="' + field + '"]');
          const error = document.querySelector("#" + field + "Error");
          wrap.classList.remove("has-error");
          error.textContent = "";
        }
      }

      function showErrors(errors) {
        clearErrors();
        for (const [field, message] of Object.entries(errors || {})) {
          if (field === "form") continue;
          const wrap = form.querySelector('[data-field="' + field + '"]');
          const error = document.querySelector("#" + field + "Error");
          if (!wrap || !error) continue;
          wrap.classList.add("has-error");
          error.textContent = String(message);
        }
        status.className = "status error";
        status.textContent = errors?.form || "Please fix the highlighted fields.";
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearErrors();
        status.className = "status";
        status.textContent = "Sending...";
        submit.disabled = true;
        const payload = Object.fromEntries(new FormData(form).entries());
        try {
          const res = await fetch("/api/lead", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data.ok === false) {
            showErrors(data.errors || { form: data.error || "Request failed" });
            return;
          }
          form.reset();
          status.className = "status";
          status.textContent = "Request accepted. ID: " + data.id;
          window.parent?.postMessage({ type: "mcphosting:data-changed", collection: "leads", id: data.id }, "*");
        } catch {
          status.className = "status error";
          status.textContent = "Network error. Please try again.";
        } finally {
          submit.disabled = false;
        }
      });
    </script>
  </body>
</html>
`;

export function leadTemplateFiles(includeForm = true) {
  return [
    { path: "functions/lib/validation.ts", content: VALIDATION_TS },
    { path: "functions/api/lead.ts", content: LEAD_FUNCTION_TS },
    ...(includeForm ? [{ path: "index.html", content: LEAD_FORM_HTML }] : []),
  ];
}
