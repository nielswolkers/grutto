import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap } from "lucide-react";

const APPS = [
  {
    id: "scholar",
    name: "Scholar",
    description: "Doorzoek wetenschappelijke artikelen met AI (OpenAlex).",
    path: "/apps/scholar",
    icon: GraduationCap,
    color: "from-violet-500 to-fuchsia-500",
  },
];

export default function Apps() {
  const navigate = useNavigate();
  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Apps</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {APPS.map((app) => {
          const Icon = app.icon;
          return (
            <Card
              key={app.id}
              onClick={() => navigate(app.path)}
              className="cursor-pointer hover:shadow-lg transition-all overflow-hidden border-dashed border-2"
            >
              <div className={`h-24 bg-gradient-to-br ${app.color} flex items-center justify-center`}>
                <Icon className="w-10 h-10 text-white" />
              </div>
              <CardContent className="p-5">
                <h3 className="font-semibold text-base">{app.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{app.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
