import { AuthForm } from "@/components/AuthForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="mb-6 text-2xl font-bold">Log in to RotationPlanner</h1>
      <AuthForm mode="login" />
    </main>
  );
}
