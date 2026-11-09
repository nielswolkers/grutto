import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { GraduationCap } from "lucide-react";
import { getConnection, disconnectMagister } from "@/lib/magister";
import { useMagisterConnect } from "./MagisterConnectFlow";

export default function MagisterIntegration() {
  const [conn, setConn] = useState<any>(null);
  const connect = useMagisterConnect();
  const load = () => getConnection().then(setConn);
  useEffect(() => { load(); window.addEventListener("magister-updated", load); return () => window.removeEventListener("magister-updated", load); }, []);
  return (
    <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><GraduationCap className="w-5 h-5 text-primary" /></div>
        <div><p className="font-medium">Magister</p><p className="text-sm text-muted-foreground">{conn ? `Verbonden${conn.last_synced_at ? " · gesynchroniseerd " + new Date(conn.last_synced_at).toLocaleString("nl-NL") : ""}` : "Niet verbonden"}</p></div>
      </div>
      {conn
        ? <Button variant="outline" size="sm" className="rounded-full" onClick={disconnectMagister}>Ontkoppelen</Button>
        : <Button variant="outline" size="sm" className="rounded-full" onClick={connect.start} disabled={connect.busy}>Verbinden</Button>}
      {connect.element}
    </div>
  );
}
