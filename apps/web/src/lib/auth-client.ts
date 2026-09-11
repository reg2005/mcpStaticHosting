"use client";

import { apiKeyClient } from "@better-auth/api-key/client";
import { createAuthClient } from "better-auth/react";

/** Browser auth client. baseURL defaults to the current origin. */
export const authClient = createAuthClient({
  plugins: [apiKeyClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
