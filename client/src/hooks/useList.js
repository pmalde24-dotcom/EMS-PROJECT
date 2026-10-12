import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

/** Normalises `{data:[], meta:{}}` list responses from the API. */
export function normalizeList(res) {
  if (!res) return { rows: [], meta: null };
  const rows = Array.isArray(res) ? res : (res.data || []);
  return { rows: Array.isArray(rows) ? rows : [], meta: res.meta || null };
}

/**
 * Server-side paginated list query.
 * @param keyParts array — react-query key parts, e.g. ['employees']
 * @param fetcher (params) => Promise<{data,meta}>
 * @param initialParams default filters
 */
export function useList(keyParts, fetcher, initialParams = {}, options = {}) {
  const [params, setParams] = useState({ page: 1, limit: 20, ...initialParams });
  const [searchInput, setSearchInput] = useState(initialParams.q || '');

  const query = useQuery({
    queryKey: [...keyParts, params],
    queryFn: () => fetcher(params),
    keepPreviousData: true,
    ...options,
  });

  const { rows, meta } = useMemo(() => normalizeList(query.data), [query.data]);

  const patch = (next) => setParams((p) => ({ ...p, page: 1, ...next }));
  const setPage = (page) => setParams((p) => ({ ...p, page }));
  const submitSearch = (e) => {
    e?.preventDefault?.();
    setParams((p) => ({ ...p, page: 1, q: searchInput.trim() || undefined }));
  };
  const reset = () => { setSearchInput(''); setParams({ page: 1, limit: 20, ...initialParams }); };

  return {
    ...query,
    rows,
    meta,
    params,
    setParams,
    patch,
    setPage,
    searchInput,
    setSearchInput,
    submitSearch,
    reset,
  };
}

/** Chart helpers */
export const chartColors = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f43f5e'];
