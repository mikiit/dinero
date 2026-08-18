import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database.types";
import { signOut } from "./sign-out";

function mockClient(error: Error | null) {
  return {
    auth: {
      signOut: vi.fn().mockResolvedValue({ error }),
    },
  } as unknown as SupabaseClient<Database>;
}

describe("signOut", () => {
  it("ends the current session", async () => {
    const supabase = mockClient(null);

    await signOut(supabase);

    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it("throws when Supabase returns an error", async () => {
    const supabase = mockClient(new Error("Network error"));

    await expect(signOut(supabase)).rejects.toThrow("Network error");
  });
});
