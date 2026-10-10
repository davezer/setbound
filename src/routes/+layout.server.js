export function load({ locals }) {
  return {
    user: locals.user
      ? { id: locals.user.id, email: locals.user.email, displayName: locals.user.display_name }
      : null
  };
}
