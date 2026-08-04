import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { upgradeAnonymousAccount } from "./upgrade-anonymous-account";

function mockClient(result: {
  data: { user: unknown };
  error: Error | null;
}) {
  return {
    auth: {
      updateUser: vi.fn().mockResolvedValue(result),
    },
  } as unknown as SupabaseClient;
}

describe("upgradeAnonymousAccount", () => {
  it("attaches email + password to the current session and returns the user", async () => {
    const user = { id: "user-1", email: "test@example.com" };
    const supabase = mockClient({ data: { user }, error: null });

    const result = await upgradeAnonymousAccount(
      supabase,
      "test@example.com",
      "hunter2pass",
    );

    expect(supabase.auth.updateUser).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "hunter2pass",
    });
    expect(result).toBe(user);
  });

  it("throws when Supabase returns an error", async () => {
    const supabase = mockClient({
      data: { user: null },
      error: new Error("Email already registered"),
    });

    await expect(
      upgradeAnonymousAccount(supabase, "taken@example.com", "hunter2pass"),
    ).rejects.toThrow("Email already registered");
  });
});
