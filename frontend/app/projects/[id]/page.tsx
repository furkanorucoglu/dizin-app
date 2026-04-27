"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  FileCheck2,
  Gauge,
  Loader2,
  PencilRuler,
  Play,
  RefreshCw,
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
import { Badge, BadgeVariant } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PdfReportDownloadButton } from "@/components/pdf-report-download-button";
import type { ProjectStatus } from "@/lib/types";

const STATUS_LABEL: Record<ProjectStatus, { text: string; variant: BadgeVariant; description: string }> = {
  draft: { text: "Taslak", variant: "muted", description: "Dosyalar hazırsa analizi başlatabilirsin." },
  analyzing: { text: "Analiz ediliyor", variant: "warning", description: "PDF ve dizin yapısı inceleniyor." },
  ready: { text: "Hazır", variant: "default", description: "Çapalar bulundu, işlem başlatılabilir." },
  processing: { text: "İşleniyor", variant: "warning", description: "Dizin girişleri Türkçe sayfalara eşleniyor." },
  done: { text: "Tamamlandı", variant: "success", description: "İnceleme ve export için hazır." },
  error: { text: "Hata", variant: "danger", description: "Akış durdu, tekrar analiz denenebilir." },
};

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const queryClient = useQueryClient();

  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.getProject(projectId),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "analyzing" || s === "processing" ? 1000 : false;
    },
  });

  const statusQuery = useQuery({
    queryKey: ["status", projectId],
    queryFn: () => api.getStatus(projectId),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "analyzing" || s === "processing" ? 1000 : false;
    },
  });

  const analysisQuery = useQuery({
    queryKey: ["analysis", projectId],
    queryFn: () => api.getAnalysis(projectId),
    enabled: !!projectQuery.data && projectQuery.data.status !== "draft",
  });

  const entriesQuery = useQuery({
    queryKey: ["entries", projectId],
    queryFn: () => api.listEntries(projectId, { limit: 50 }),
    enabled: projectQuery.data?.status === "done",
  });

  const analyze = useMutation({
    mutationFn: () => api.analyze(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["status", projectId] });
      toast.success("Analiz başlatıldı");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const process = useMutation({
    mutationFn: async () => {
      const analysis = await api.getAnalysis(projectId);
      if (analysis.anchors.length > 0) {
        await api.confirmAnchors(
          projectId,
          analysis.anchors.map((anchor) => ({ en_page: anchor.en_page, tr_page: anchor.tr_page })),
        );
      }
      await api.process(projectId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["status", projectId] });
      toast.success("İşlem başlatıldı");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (projectQuery.isLoading) return <DetailSkeleton />;

  if (projectQuery.error) {
    return (
      <Card className="border-red-200 bg-red-50/80">
        <CardContent className="flex gap-3 pt-6 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-5 w-5" />
          <div>
            <p className="font-semibold">Proje yüklenemedi</p>
            <p className="mt-1">{(projectQuery.error as Error).message}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const project = projectQuery.data!;
  const status = statusQuery.data;
  const analysis = analysisQuery.data;
  const entries = entriesQuery.data;
  const label = STATUS_LABEL[project.status];

  const progressPct = status?.last_progress
    ? Math.round(status.last_progress * 100)
    : project.status === "done"
      ? 100
      : project.status === "processing" || project.status === "analyzing"
        ? 8
        : 0;

  const filesReady = !!project.en_pdf_path && !!project.tr_pdf_path && !!project.index_docx_path;
  const canStartAnalyze = project.status === "draft";
  const canStartProcess = project.status === "ready";
  const isRunning = project.status === "analyzing" || project.status === "processing";

  return (
    <div className="flex flex-col gap-6">
      <section className="surface-card overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <Link
              href="/"
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition hover:text-slate-950"
            >
              <ArrowLeft className="h-4 w-4" /> Projeler
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={label.variant}>{label.text}</Badge>
              <span className="text-sm text-slate-500">
                Oluşturuldu: {dateFormatter.format(new Date(project.created_at))}
              </span>
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              {project.title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{label.description}</p>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            {canStartAnalyze && (
              <Button onClick={() => analyze.mutate()} disabled={!filesReady || analyze.isPending} className="rounded-2xl">
                {analyze.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Analizi başlat
              </Button>
            )}
            {canStartProcess && (
              <Button onClick={() => process.mutate()} disabled={process.isPending} className="rounded-2xl">
                {process.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                İşlemi başlat
              </Button>
            )}
            {project.status === "done" && (
              <>
                <Link href={`/projects/${projectId}/review`}>
                  <Button className="rounded-2xl">
                    <PencilRuler className="h-4 w-4" /> İncele
                  </Button>
                </Link>
                <PdfReportDownloadButton projectId={projectId} title={project.title} />
              </>
            )}
            {(project.status === "error" || project.status === "ready") && (
              <Button variant="outline" onClick={() => analyze.mutate()} disabled={analyze.isPending} className="rounded-2xl bg-white/70">
                {analyze.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Yeniden analiz
              </Button>
            )}
          </div>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <MetricCard icon={<FileCheck2 className="h-4 w-4" />} label="Dosya durumu" value={filesReady ? "Hazır" : "Eksik"} />
          <MetricCard icon={<Gauge className="h-4 w-4" />} label="İlerleme" value={`${progressPct}%`} />
          <MetricCard icon={<BookOpenCheck className="h-4 w-4" />} label="Çapa sayısı" value={analysis?.anchors.length ?? "-"} />
        </div>
      </section>

      {isRunning && (
        <Card className="border-amber-200 bg-amber-50/80 shadow-sm">
          <CardContent className="flex flex-col gap-3 pt-6">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="inline-flex items-center gap-2 font-medium text-amber-900">
                <Activity className="h-4 w-4 animate-pulse" />
                {status?.last_message ?? "Çalışıyor…"}
              </span>
              <span className="font-semibold text-amber-900">{progressPct}%</span>
            </div>
            <Progress value={progressPct} />
          </CardContent>
        </Card>
      )}

      {project.status === "error" && project.status_detail && (
        <Card className="border-red-200 bg-red-50/80">
          <CardContent className="flex gap-3 pt-6 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">İşlem hatası</p>
              <p className="mt-1 leading-6">{project.status_detail}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
        <Card className="surface-card border-slate-200/80">
          <CardHeader>
            <CardTitle className="text-base">Dosyalar</CardTitle>
            <CardDescription>Akışın devam edebilmesi için üç dosya da yüklü olmalı.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <FileRow label="EN PDF" present={!!project.en_pdf_path} />
            <FileRow label="TR PDF" present={!!project.tr_pdf_path} />
            <FileRow label="Dizin DOCX" present={!!project.index_docx_path} />
          </CardContent>
        </Card>

        <Card className="surface-card border-slate-200/80">
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="text-base">Analiz ve çapalar</CardTitle>
              <CardDescription>Auto-detected offsetler ve bölüm eşleştirmeleri.</CardDescription>
            </div>
            <Link href={`/projects/${projectId}/anchors`}>
              <Button size="sm" variant="outline" className="rounded-2xl bg-white">
                Düzenle <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
            <KV label="EN offset" value={project.en_offset ?? "-"} />
            <KV label="TR offset" value={project.tr_offset ?? "-"} />
            <KV label="Çapa" value={analysis?.anchors.length ?? "-"} />
          </CardContent>
        </Card>
      </div>

      {project.status === "done" && entries && (
        <Card className="surface-card overflow-hidden border-slate-200/80">
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="text-base">Dizin girişleri ({entries.total})</CardTitle>
              <CardDescription>
                İlk 50 kayıt. Detaylı düzeltme için inceleme ekranını aç.
              </CardDescription>
            </div>
            <Link href={`/projects/${projectId}/review`}>
              <Button size="sm" className="rounded-2xl">
                İnceleme Ekranı <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="scrollbar-thin max-h-[520px] overflow-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Headword</th>
                    <th className="px-4 py-3">Orijinal</th>
                    <th className="px-4 py-3">Çevrilmiş</th>
                    <th className="px-4 py-3">Güven</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.items.map((entry) => (
                    <tr key={entry.id} className="border-b border-slate-100 transition hover:bg-slate-50/80 last:border-0">
                      <td className="px-4 py-3 font-semibold text-slate-950">{entry.headword}</td>
                      <td className="px-4 py-3 text-slate-500">{entry.original_pages.map((p) => p.raw ?? `${p.start}`).join(", ")}</td>
                      <td className="px-4 py-3 text-slate-700">{entry.translated_pages.map((p) => p.raw ?? `${p.start}`).join(", ")}</td>
                      <td className="px-4 py-3"><ConfidenceBadge value={entry.confidence} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white/[0.72] p-4 shadow-sm">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">{icon}</div>
      <div className="text-xl font-semibold tracking-tight text-slate-950">{value}</div>
      <div className="text-xs font-medium text-slate-500">{label}</div>
    </div>
  );
}

function FileRow({ label, present }: { label: string; present: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white/[0.72] px-4 py-3">
      <span className="font-medium text-slate-700">{label}</span>
      <Badge variant={present ? "success" : "muted"}>{present ? "yüklendi" : "eksik"}</Badge>
    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/[0.72] p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function ConfidenceBadge({ value }: { value: "high" | "medium" | "low" }) {
  const map: Record<"high" | "medium" | "low", BadgeVariant> = {
    high: "success",
    medium: "warning",
    low: "danger",
  };
  const text = value === "high" ? "Yüksek" : value === "medium" ? "Orta" : "Düşük";
  return <Badge variant={map[value]}>{text}</Badge>;
}

function DetailSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6">
      <div className="surface-card h-72" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface-card h-56" />
        <div className="surface-card h-56" />
      </div>
    </div>
  );
}
