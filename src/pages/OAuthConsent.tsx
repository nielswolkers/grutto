import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};

function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Geen authorization_id gevonden in de link.");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      const { data, error: detailsError } = await oauthApi().getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (detailsError) {
        setError(detailsError.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    const api = oauthApi();
    const { data, error: decideError } = approve
      ? await api.approveAuthorization(authorizationId)
      : await api.denyAuthorization(authorizationId);
    if (decideError) {
      setBusy(false);
      setError(decideError.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("De autorisatieserver gaf geen redirect terug.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "deze app";

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        {error ? (
          <>
            <CardHeader>
              <CardTitle>Verzoek kon niet worden geladen</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Vraag de app om de verbinding opnieuw te starten.
              </p>
            </CardContent>
          </>
        ) : !details ? (
          <CardHeader>
            <CardTitle>Laden…</CardTitle>
          </CardHeader>
        ) : (
          <>
            <CardHeader>
              <CardTitle>{clientName} verbinden met je Grutto-account</CardTitle>
              <CardDescription>
                {clientName} krijgt toegang tot je vakken, studiesets, taken, agenda en notities — en handelt
                namens jou.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-3">
              <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
                Goedkeuren
              </Button>
              <Button className="flex-1" variant="outline" disabled={busy} onClick={() => decide(false)}>
                Weigeren
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </main>
  );
}
