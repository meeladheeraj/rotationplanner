import { AuthForm } from "@/components/AuthForm";
import { HeroArt, Wordmark } from "@/components/Illustrations";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Wordmark className="mb-6 text-brand" />
      <HeroArt className="mb-6 h-28 w-full text-brand" />
      <h1 className="mb-1 text-2xl font-bold">Welcome back</h1>
      <p className="mb-6 text-sm text-gray-500">Log in to manage your rotation schedules.</p>
      <AuthForm mode="login" />
    </main>
  );
}
