import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { signUpWithPassword } from "./sign-up";

function clientReturning(result: unknown) {
  return {
    auth: { signUp: vi.fn().mockResolvedValue(result) },
  } as unknown as SupabaseClient<Database> & { auth: { signUp: ReturnType<typeof vi.fn> } };
}

describe("signUpWithPassword", () => {
  it("reports signed-in when Supabase returns a session", async () => {
    const supabase = clientReturning({ data: { session: { access_token: "x" }, user: {} }, error: null });
    await expect(signUpWithPassword(supabase, "a@b.co", "longenough1")).resolves.toEqual({ signedIn: true });
    expect(supabase.auth.signUp).toHaveBeenCalledWith({ email: "a@b.co", password: "longenough1" });
  });

  it("reports not signed-in when email confirmation is required (no session)", async () => {
    const supabase = clientReturning({ data: { session: null, user: {} }, error: null });
    await expect(signUpWithPassword(supabase, "a@b.co", "longenough1")).resolves.toEqual({ signedIn: false });
  });

  it("passes the confirmation redirect through when given", async () => {
    const supabase = clientReturning({ data: { session: null, user: {} }, error: null });
    await signUpWithPassword(supabase, "a@b.co", "longenough1", {
      emailRedirectTo: "https://app.example/auth/callback?next=%2Fjoin%2Fabc",
    });
    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: "a@b.co",
      password: "longenough1",
      options: { emailRedirectTo: "https://app.example/auth/callback?next=%2Fjoin%2Fabc" },
    });
  });

  it("throws Supabase's error (e.g. a weak password) instead of swallowing it", async () => {
    const supabase = clientReturning({ data: { session: null, user: null }, error: new Error("Password should be at least 6 characters") });
    await expect(signUpWithPassword(supabase, "a@b.co", "x")).rejects.toThrow(/at least 6/);
  });
});
