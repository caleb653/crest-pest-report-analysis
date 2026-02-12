import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import crestLogo from "@/assets/crest-logo-black.png";

const CORRECT_PIN = "2709C";
const STORAGE_KEY = "app_pin_verified";

const PinGate = ({ children }: { children: React.ReactNode }) => {
  const [verified, setVerified] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY) === "true") {
      setVerified(true);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.toUpperCase() === CORRECT_PIN) {
      sessionStorage.setItem(STORAGE_KEY, "true");
      setVerified(true);
      setError(false);
    } else {
      setError(true);
      setPin("");
    }
  };

  if (verified) return <>{children}</>;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader className="text-center pb-4">
          <img src={crestLogo} alt="Crest Pest Control" className="w-28 mx-auto mb-3" />
          <CardTitle className="text-xl">Enter Access Code</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              value={pin}
              onChange={(e) => { setPin(e.target.value); setError(false); }}
              placeholder="Access code"
              className="text-center text-lg tracking-widest h-12 uppercase"
              autoFocus
              autoComplete="off"
            />
            {error && (
              <p className="text-destructive text-sm text-center">Incorrect code. Try again.</p>
            )}
            <Button type="submit" className="w-full" disabled={!pin.trim()}>
              Enter
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default PinGate;
