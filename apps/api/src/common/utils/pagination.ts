export function getPaginationMeta(page: number, pageSize: number, total: number) {
  const pages = Math.ceil(total / pageSize);

  return {
    page,
    pageSize,
    pages,
    hasMore: page < pages,
  };
}
