import "server-only";
import NextAuth, { type NextAuthOptions } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PublicAuthAdapter } from "@/lib/publicAuthAdapter";
import { verifyPasswordLogin } from "@/lib/passwordAuth";
import { ensureAuthUserId, isAuthUserUuid } from "@/lib/ensureAuthUser";

function googleProviders() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return [];
  return [
    GoogleProvider({
      clientId,
      clientSecret,
      allowDangerousEmailAccountLinking: true,
    }),
  ];
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    ...googleProviders(),
    CredentialsProvider({
      id: "credentials",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim() ?? "";
        const password = credentials?.password ?? "";
        if (!email || !password) return null;
        const user = await verifyPasswordLogin(email, password);
        if (!user) return null;
        return { id: user.id, email: user.email, name: user.name ?? undefined };
      },
    }),
  ],
  adapter: PublicAuthAdapter() as Adapter,
  session: {
    strategy: "jwt",
    maxAge: 90 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  jwt: {
    maxAge: 90 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/settings",
    error: "/settings",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      if (user?.email) token.email = user.email;
      if (user?.name) token.name = user.name;
      if (user?.image) token.picture = user.image;

      const email =
        typeof token.email === "string" ? token.email : undefined;
      // Heal on sign-in, or whenever the token still lacks our auth_users UUID
      // (Google often leaves `sub` as the Google subject id).
      if (
        email &&
        (user || !isAuthUserUuid(String(token.id ?? "")))
      ) {
        const ensured = await ensureAuthUserId({
          id: typeof token.id === "string" ? token.id : null,
          email,
          name: typeof token.name === "string" ? token.name : null,
          image: typeof token.picture === "string" ? token.picture : null,
        });
        if ("id" in ensured) token.id = ensured.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const id = String(token.id ?? "");
        session.user.id = isAuthUserUuid(id) ? id : "";
        if (token.email) session.user.email = String(token.email);
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
