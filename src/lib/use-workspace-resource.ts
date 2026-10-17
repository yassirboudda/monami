"use client"

import { useAuth } from "@/lib/auth"
import { useCallback } from "react"
import useSWR from "swr"
import { apiFetch } from "@/lib/api"

type WorkspaceKey = readonly [string, string, string | null]

type RequestOptions = {
  method?: string
  body?: unknown
}

export function useWorkspaceResource<T>(path: string) {
  const { getToken, userId, orgId } = useAuth()
  const key: WorkspaceKey | null = userId ? [path, userId, orgId] : null

  const request = useCallback(
    async <R,>(requestPath: string, options: RequestOptions = {}) => {
      const token = await getToken()
      if (!token) throw new Error("Session OctoHandy introuvable")
      return apiFetch<R>(requestPath, { ...options, token })
    },
    [getToken]
  )

  const fetcher = useCallback(
    async ([requestPath]: WorkspaceKey) => request<T>(requestPath),
    [request]
  )
  const resource = useSWR<T, Error, WorkspaceKey | null>(key, fetcher)

  return { ...resource, request, orgId }
}
