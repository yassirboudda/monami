"use client"

// Clerk is the identity provider again (multi-user). Every data call sends the Clerk session JWT as Bearer;
// the Hetzner API verifies it against the instance JWKS and derives the workspace (org:<id> or user:<id>).
export { useAuth, useClerk, useOrganization, useUser } from "@clerk/nextjs"
