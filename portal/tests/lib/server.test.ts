import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _resetSupabaseClientForTests,
  getSupabaseClient,
  SupabaseNotConfiguredError,
} from "@/lib/supabase/server";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  _resetSupabaseClientForTests();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  _resetSupabaseClientForTests();
});

describe("getSupabaseClient", () => {
  it("throws SupabaseNotConfiguredError when env vars are missing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(() => getSupabaseClient()).toThrow(SupabaseNotConfiguredError);
  });

  it("returns a client when both env vars are set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    expect(() => getSupabaseClient()).not.toThrow();
  });
});

describe("app/error.tsx routing logic", () => {
  it("SupabaseNotConfiguredError has the exact name the error boundary checks for", () => {
    // app/error.tsx branches on `error.name === "SupabaseNotConfiguredError"` —
    // pin the name here so a rename of the class doesn't silently break that
    // string comparison.
    expect(new SupabaseNotConfiguredError().name).toBe(
      "SupabaseNotConfiguredError"
    );
  });
});
