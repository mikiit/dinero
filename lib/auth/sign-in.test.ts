import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database.types";
import { signInWithPassword } from "./sign-in";

function mockClient(result: { data: { user: unknown }; error: Error | null }) {
  return {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue(result),
    },
  } as unknown as SupabaseClient<Database>;
}

describe("signInWithPassword", () => {
  it("signs in with the given credentials and returns the user", async () => {
    const user = { id: "user-1", email: "test@example.com" };
    const supabase = mockClient({ data: { user }, error: null });

    const result = await signInWithPassword(supabase, "test@example.com", "hunter2pass");

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "hunter2pass",
    });
    expect(result).toBe(user);
  });

  it("throws when Supabase returns an error", async () => {
    const supabase = mockClient({
      data: { user: null },
      error: new Error("Invalid login credentials"),
    });

    await expect(
      signInWithPassword(supabase, "wrong@example.com", "wrongpass"),
    ).rejects.toThrow("Invalid login credentials");
  });
});
