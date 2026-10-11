export function load({ locals }) {
  const user = locals.user
    ? {
        id: locals.user.id,
        email: locals.user.email,
        displayName: locals.user.display_name,
        isAdmin: Boolean(locals.user.is_admin)
      }
    : null;

  return {
    user,
    accountUser: user,
    isAdmin: Boolean(locals.isAdmin || user?.isAdmin)
  };
}
