"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  GitBranch,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AnchorEditor } from "@/components/anchor-editor";

export default function AnchorsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();

  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.getProject(projectId),
  });

  const analysisQuery = useQuery({
    queryKey: ["analysis", projectId],
    queryFn: () => api.getAnalysis(projectId),
  });

  const saveAnchors = useMutation({
    mutationFn: (anchors: { en_page: number; tr_page: number }[]) => api.confirmAnchors(projectId, anchors),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analysis", projectId] });
      toast.success("Çapalar kaydedildi, işlem yeniden başlatılıyor…");
      api.process(projectId).then(() => router.push(`/projects/${projectId}`));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (projectQuery.isLoading || analysisQuery.isLoading) {
    return <div className="surface-card h-72 animate-pulse" />;
  }

  if (!projectQuery.data || !analysisQuery.data) {
    return (
      <Card className="border-red-200 bg-red-50/80">
        <CardContent className="pt-6 text-sm text-red-700">Veri bulunamadı.</CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <section className="surface-card overflow-hidden p-6 sm:p-8">
        <Link
          href={`/projects/${projectId}`}
          className="mb-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition hover:text-slate-950"
        >
          <ArrowLeft className="h-4 w-4" /> Proje detayı
        </Link>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
              <Sparkles className="h-3.5 w-3.5" /> Offset eşleştirme
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Bölüm çapalarını düzenle</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              İngilizce ve Türkçe PDF arasında bölüm başlangıçlarını eşleştir. Kaydedince sistem bu çapalarla sayfa dönüşümünü yeniden çalıştırır.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["analysis", projectId] })}
            className="rounded-2xl bg-white/70"
          >
            <RefreshCw className="h-4 w-4" /> Yenile
          </Button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <InfoPill icon={<GitBranch className="h-4 w-4" />} label="Çapa sayısı" value={analysisQuery.data.anchors.length} />
          <InfoPill icon={<CheckCircle2 className="h-4 w-4" />} label="EN offset" value={projectQuery.data.en_offset ?? "-"} />
          <InfoPill icon={<CheckCircle2 className="h-4 w-4" />} label="TR offset" value={projectQuery.data.tr_offset ?? "-"} />
        </div>
      </section>

      <Card className="surface-card border-slate-200/80">
        <CardHeader>
          <CardTitle className="text-base">Çapa editörü</CardTitle>
          <CardDescription>
            Hatalı eşleşmeleri düzeltip kaydet. Düşük güvenli dizin dönüşümlerini azaltır.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnchorEditor
            projectId={projectId}
            initialAnchors={analysisQuery.data.anchors}
            onSave={(anchors) => saveAnchors.mutate(anchors)}
            isSaving={saveAnchors.isPending}
          />
          {saveAnchors.isPending && (
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
              <Loader2 className="h-4 w-4 animate-spin" /> Kaydediliyor ve işlem başlatılıyor…
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InfoPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white/[0.72] p-4 shadow-sm">
      <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">{icon}</div>
      <div className="text-xl font-semibold tracking-tight text-slate-950">{value}</div>
      <div className="text-xs font-medium text-slate-500">{label}</div>
    </div>
  );
}
