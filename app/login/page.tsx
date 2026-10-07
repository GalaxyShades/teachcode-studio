import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
export default async function Login() {
  if (await currentUser()) redirect("/courses");
  return <LoginForm />;
}
