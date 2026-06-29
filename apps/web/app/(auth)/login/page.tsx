import { AuthForm } from "@/components/AuthForm";
import { AuthLayout } from "@/components/AuthLayout";

export default function LoginPage() {
  return (
    <AuthLayout heading="Welcome back" subheading="Log in to manage your rotation schedules.">
      <AuthForm mode="login" googleEnabled={!!process.env.GOOGLE_CLIENT_ID} />
    </AuthLayout>
  );
}
