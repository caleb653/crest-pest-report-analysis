import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import crestLogo from "@/assets/crest-logo-black.png";

const STORAGE_KEY = "app_user_verified";
const USER_KEY = "app_logged_in_user";

const USERS: Record<string, { password: string; fullName: string }> = {
  darrell: { password: "2709", fullName: "Darrell Tanner" },
  jesse: { password: "2709", fullName: "Jesse Angulo" },
  jake: { password: "2709", fullName: "Jake Shubin" },
  caleb: { password: "2709", fullName: "Caleb Whalen" },
  jackson: { password: "2709", fullName: "Jackson Latham" },
  dylan: { password: "2709", fullName: "Dylan Gallegos" },
  michael: { password: "2709", fullName: "Michael Muniz" },
};

const PinGate = ({ children }: { children: React.ReactNode }) => {
  const [verified, setVerified] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY) === "true") {
      setVerified(true);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const key = username.trim().toLowerCase();
    const user = USERS[key];

    if (!user) {
      setError("User not found");
      return;
    }

    if (password !== user.password) {
      setError("Incorrect password");
      setPassword("");
      return;
    }

    sessionStorage.setItem(STORAGE_KEY, "true");
    sessionStorage.setItem(USER_KEY, user.fullName);
    setVerified(true);
    setError("");
  };

  if (verified) return <>{children}</>;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader className="text-center pb-4">
          <img src={crestLogo} alt="Crest Pest Control" className="w-28 mx-auto mb-3" />
          <CardTitle className="text-xl">Technician Login</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(""); }}
                placeholder="e.g. caleb"
                className="text-center text-lg h-12 lowercase"
                autoFocus
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                placeholder="Password"
                className="text-center text-lg h-12"
                autoComplete="off"
              />
            </div>
            {error && (
              <p className="text-destructive text-sm text-center">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={!username.trim() || !password.trim()}>
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default PinGate;
