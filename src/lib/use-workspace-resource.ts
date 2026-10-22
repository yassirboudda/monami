"use client"

import { useAuth } from "@/lib/auth"
import { useCallback } from "react"
import useSWR, { type SWRConfiguration } from "swr"
import { apiFetch } from "@/lib/api"

type WorkspaceKey = readonly [string, string, string | null]

type RequestOptions = {
  method?: string
  body?: unknown
}

export function useWorkspaceResource<T>(path: string, options?: SWRConfiguration<T, Error>) {
  const { getToken, userId, orgId } = useAuth()
  const key: WorkspaceKey | null = userId ? [path, userId, orgId] : null

  const request = useCallback(
    async <R,>(requestPath: string, options: RequestOptions = {}) => {
      const token = await getToken()
      if (!token) throw new Error("Session MonAmi introuvable")
      return apiFetch<R>(requestPath, { ...options, token })
    },
    [getToken]
  )

  const fetcher = useCallback(
    async ([requestPath]: WorkspaceKey) => request<T>(requestPath),
    [request]
  )
  const resource = useSWR<T, Error, WorkspaceKey | null>(key, fetcher, options)

  return { ...resource, request, orgId }
}
