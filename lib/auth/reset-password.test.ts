import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "./password";
import { requestPasswordReset, setNewPassword } from "./reset-password";

function client(auth: Record<string, unknown>) {
  return { auth } as unknown as SupabaseClient<Database>;
}

describe("validateNewPassword", () => {
  it("accepts a long-enough password, with or without a matching confirmation", () => {
    expect(validateNewPassword("correct-horse-1")).toBeNull();
    expect(validateNewPassword("correct-horse-1", "correct-horse-1")).toBeNull();
  });

  it("rejects short passwords, mismatches, and whitespace-only", () => {
    expect(validateNewPassword("x".repeat(MIN_PASSWORD_LENGTH - 1))).toMatch(/at least/);
    expect(validateNewPassword("correct-horse-1", "correct-horse-2")).toMatch(/match/);
    expect(validateNewPassword(" ".repeat(MIN_PASSWORD_LENGTH))).toMatch(/spaces/);
  });
});

describe("requestPasswordReset", () => {
  it("sends the reset email with the redirect", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ data: {}, error: null });
    await requestPasswordReset(client({ resetPasswordForEmail }), "a@b.co", "https://app/auth/callback");
    expect(resetPasswordForEmail).toHaveBeenCalledWith("a@b.co", {
      redirectTo: "https://app/auth/callback",
    });
  });

  it("surfaces Supabase's error (e.g. rate limit)", async () => {
    const resetPasswordForEmail = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error("email rate limit exceeded") });
    await expect(
      requestPasswordReset(client({ resetPasswordForEmail }), "a@b.co", "https://app"),
    ).rejects.toThrow(/rate limit/);
  });
});

describe("setNewPassword", () => {
  it("changes the password, then signs out every other session", async () => {
    const calls: string[] = [];
    const updateUser = vi.fn().mockImplementation(async () => {
      calls.push("updateUser");
      return { data: {}, error: null };
    });
    const signOut = vi.fn().mockImplementation(async () => {
      calls.push("signOut");
      return { error: null };
    });
    await setNewPassword(client({ updateUser, signOut }), "new-password-1");

    expect(updateUser).toHaveBeenCalledWith({ password: "new-password-1" });
    expect(signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(calls).toEqual(["updateUser", "signOut"]);
  });

  it("does not sign anyone out if the password change itself failed", async () => {
    const updateUser = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error("New password should be different") });
    const signOut = vi.fn();
    await expect(setNewPassword(client({ updateUser, signOut }), "same")).rejects.toThrow(/different/);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("keeps the change even if ending other sessions fails", async () => {
    const updateUser = vi.fn().mockResolvedValue({ data: {}, error: null });
    const signOut = vi.fn().mockResolvedValue({ error: new Error("network") });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(setNewPassword(client({ updateUser, signOut }), "new-password-1")).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
