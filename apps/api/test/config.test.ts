import { describe, expect, it } from "vitest";
import { buildConfig } from "../src/config.js";

describe("api configuration", () => {
  it("refuses to start production without an operator token", () => {
    expect(() =>
      buildConfig({
        NODE_ENV: "production",
        AGENTOPS_ALLOWED_ORIGINS: "https://agentops.ai"
      })
    ).toThrow("AGENTOPS_OPERATOR_TOKEN");
  });

  it("refuses to start production without allowed origins", () => {
    expect(() =>
      buildConfig({
        NODE_ENV: "production",
        AGENTOPS_OPERATOR_TOKEN: "secret"
      })
    ).toThrow("AGENTOPS_ALLOWED_ORIGINS");
  });

  it("accepts a locked production configuration", () => {
    const locked = buildConfig({
      NODE_ENV: "production",
      AGENTOPS_OPERATOR_TOKEN: "secret",
      AGENTOPS_ALLOWED_ORIGINS: "https://agentops.ai,https://www.agentops.ai"
    });

    expect(locked.appEnv).toBe("production");
    expect(locked.operatorToken).toBe("secret");
    expect(locked.httpAllowedOrigins).toEqual(["https://agentops.ai", "https://www.agentops.ai"]);
  });

  it("uses the Netlify database URL when DATABASE_URL is not set", () => {
    const locked = buildConfig({
      NODE_ENV: "production",
      NETLIFY_DATABASE_URL: "postgres://netlify:secret@db.example/agentops",
      AGENTOPS_OPERATOR_TOKEN: "secret",
      AGENTOPS_ALLOWED_ORIGINS: "https://agentic-unicorn-os.netlify.app"
    });

    expect(locked.databaseUrl).toBe("postgres://netlify:secret@db.example/agentops");
  });
});
