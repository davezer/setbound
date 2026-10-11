export function load({ locals }) {
  const user = locals.user
    ? {
        id: locals.user.id,
        email: locals.user.email,
        displayName: locals.user.display_name
      }
    : null;

  return {
    user,
    accountUser: user
  };
}
