import { Toaster } from "@/components/ui/toaster";
import Notities from "./pages/Notities";
import Ontdekken from "./pages/Ontdekken";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider } from "./contexts/SidebarContext";
import DashboardLayout from "./pages/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import Materialen from "./pages/Materialen";
import Scholar from "./pages/Scholar";
import StudySetView from "./pages/StudySetView";
import FolderView from "./pages/FolderView";
import FilePreview from "./pages/FilePreview";
import Meldingen from "./pages/Meldingen";
import Account from "./pages/Account";
import Taken from "./pages/Taken";
import Agenda from "./pages/Agenda";
import PlaceholderPage from "./pages/PlaceholderPage";
import Studie from "./pages/Studie";
import UserProfile from "./pages/UserProfile";
import GroupProfile from "./pages/GroupProfile";
import CommunityPage from "./pages/CommunityPage";
import Callback from "./pages/Callback";
import GoogleCallback from "./pages/GoogleCallback";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import OAuthConsent from "./pages/OAuthConsent";
import SearchResults from "./pages/SearchResults";
import { useAuth } from "./hooks/useAuth";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Laden...</div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  
  return <>{children}</>;
}

/** Blocks Grutto Plus pages when the setting is off. */
function PlusRoute({ children }: { children: React.ReactNode }) {
  const { enabled, loading } = useGruttoPlus();
  if (loading) return null;
  if (!enabled) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
      <Route path="/callback" element={<Callback />} />
      <Route path="/callback/google" element={<GoogleCallback />} />

      <Route element={
        <ProtectedRoute>
          <DashboardLayout />
        </ProtectedRoute>
      }>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/agenda" element={<Agenda />} />
        <Route path="/studie" element={<Studie />} />
        <Route path="/cijfers" element={<PlaceholderPage />} />
        <Route path="/taken" element={<Taken />} />
        <Route path="/materialen" element={<Materialen />} />
        <Route path="/bestanden" element={<Navigate to="/materialen" replace />} />
        <Route path="/materialen/folder/:folderId" element={<FolderView />} />
        <Route path="/materialen/preview/:fileId" element={<FilePreview />} />
        <Route path="/bestanden/folder/:folderId" element={<Navigate to="/materialen" replace />} />
        <Route path="/bestanden/preview/:fileId" element={<Navigate to="/materialen" replace />} />
        <Route path="/notities" element={<Notities />} />
        <Route path="/ontdekken" element={<Navigate to="/communities" replace />} />
        <Route path="/communities" element={<Ontdekken />} />
        <Route path="/zoeken" element={<SearchResults />} />
        <Route path="/hashtag/:hashtag" element={<SearchResults />} />
        <Route path="/meldingen" element={<Meldingen />} />
        <Route path="/account" element={<Account />} />
        <Route path="/profiel/:username" element={<UserProfile />} />
        <Route path="/groep/:groupId" element={<GroupProfile />} />
        <Route path="/community/:communityId" element={<CommunityPage />} />
        <Route path="/instellingen" element={<Settings />} />
        <Route path="/grutto-ai" element={<Scholar />} />
        <Route path="/apps" element={<Navigate to="/grutto-ai" replace />} />
        <Route path="/apps/scholar" element={<Navigate to="/grutto-ai" replace />} />
        <Route path="/studieset/:setId" element={<StudySetView />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <SidebarProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </SidebarProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
