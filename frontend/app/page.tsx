"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
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
import type { ProjectStatus } from "@/lib/types";

type ProjectListItem = Awaited<ReturnType<typeof api.listProjects>>[number];

const STATUS_LABEL: Record<ProjectStatus, { text: string; variant: BadgeVariant; tone: string }> = {
  draft: { text: "Taslak", variant: "muted", tone: "bg-slate-100 text-slate-700" },
  analyzing: { text: "Analiz ediliyor", variant: "warning", tone: "bg-amber-100 text-amber-800" },
  ready: { text: "Hazır", variant: "default", tone: "bg-blue-100 text-blue-800" },
  processing: { text: "İşleniyor", variant: "warning", tone: "bg-amber-100 text-amber-800" },
  done: { text: "Tamamlandı", variant: "success", tone: "bg-emerald-100 text-emerald-800" },
  error: { text: "Hata", variant: "danger", tone: "bg-red-100 text-red-800" },
};

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function HomePage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["projects"],
    queryFn: api.listProjects,
  });

  const projects = data ?? [];
  const completedCount = projects.filter((p) => p.status === "done").length;
  const activeCount = projects.filter((p) => p.status === "analyzing" || p.status === "processing").length;
  const errorCount = projects.filter((p) => p.status === "error").length;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Proje silindi");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col gap-8">
      <section className="surface-card relative overflow-hidden px-6 py-7 sm:px-8 lg:px-10">
        <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-36 h-44 w-44 rounded-full bg-violet-500/10 blur-3xl" />

        <div className="relative grid gap-8 lg:grid-cols-[1fr_360px] lg:items-end">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-violet-500" />
              Dizin dönüştürme çalışma alanı
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">
              Kitap dizinlerini daha hızlı, daha kontrollü ve hatasız yönetin.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              İngilizce PDF, Türkçe PDF ve mevcut DOCX dizinini tek akışta yükleyin; analiz, çapa doğrulama, inceleme ve export süreçlerini tek panelden takip edin.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/projects/new">
                <Button size="lg" className="rounded-2xl shadow-lg shadow-slate-900/10">
                  <Plus className="h-4 w-4" /> Yeni Proje Oluştur
                </Button>
              </Link>
              <a href="#project-list">
                <Button size="lg" variant="outline" className="rounded-2xl bg-white/70">
                  <Search className="h-4 w-4" /> Projeleri Gör
                </Button>
              </a>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 lg:grid-cols-1">
            <StatCard label="Toplam" value={projects.length} icon={<FileText className="h-4 w-4" />} />
            <StatCard label="Tamamlanan" value={completedCount} icon={<CheckCircle2 className="h-4 w-4" />} />
            <StatCard label="Aktif / Hata" value={`${activeCount}/${errorCount}`} icon={<Clock3 className="h-4 w-4" />} />
          </div>
        </div>
      </section>

      <section id="project-list" className="flex flex-col gap-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">Workspace</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Projeler</h2>
            <p className="mt-1 text-sm text-slate-600">
              Durumları takip et, inceleme ekranına geç veya export al.
            </p>
          </div>
          <Link href="/projects/new" className="sm:self-center">
            <Button className="w-full rounded-2xl sm:w-auto">
              <Plus className="h-4 w-4" /> Yeni Proje
            </Button>
          </Link>
        </div>

        {isLoading && <ProjectGridSkeleton />}

        {error && (
          <Card className="border-red-200 bg-red-50/80 shadow-sm">
            <CardContent className="flex gap-3 pt-6 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">API&apos;ye bağlanılamadı</p>
                <p className="mt-1 text-red-700/80">{(error as Error).message}</p>
                <p className="mt-2 text-xs text-red-700/70">
                  Backend çalışıyor mu? <code className="rounded bg-red-100 px-1.5 py-0.5">uvicorn api.main:app --port 8000</code>
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && projects.length === 0 && <EmptyState />}

        {!isLoading && !error && projects.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onDelete={() => {
                  if (confirm(`“${project.title}” silinsin mi?`)) {
                    deleteMutation.mutate(project.id);
                  }
                }}
                isDeleting={deleteMutation.isPending}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ProjectCard({
  project,
  onDelete,
  isDeleting,
}: {
  project: ProjectListItem;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const label = STATUS_LABEL[project.status];

  return (
    <Card className="group flex min-h-[230px] flex-col overflow-hidden border-slate-200/80 bg-white/[0.84] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-slate-900/10">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-900/[0.15]">
            <BookOpenCheck className="h-5 w-5" />
          </div>
          <Badge variant={label.variant}>{label.text}</Badge>
        </div>
        <div className="pt-4">
          <Link href={`/projects/${project.id}`} className="block">
            <CardTitle className="line-clamp-2 text-lg leading-6 text-slate-950 transition-colors group-hover:text-blue-700">
              {project.title}
            </CardTitle>
          </Link>
          <CardDescription className="mt-2 inline-flex items-center gap-1.5 text-xs">
            <CalendarClock className="h-3.5 w-3.5" />
            {dateFormatter.format(new Date(project.created_at))}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="mt-auto flex items-center justify-between gap-3 pt-3">
        <Link href={`/projects/${project.id}`} className="flex-1">
          <Button variant="outline" className="w-full rounded-2xl bg-white">
            Aç <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-2xl text-slate-500 hover:bg-red-50 hover:text-red-600"
          onClick={onDelete}
          disabled={isDeleting}
          aria-label={`${project.title} projesini sil`}
        >
          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/70 bg-white/[0.72] p-4 shadow-sm backdrop-blur">
      <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
        {icon}
      </div>
      <div className="text-2xl font-semibold tracking-tight text-slate-950">{value}</div>
      <div className="text-xs font-medium text-slate-500">{label}</div>
    </div>
  );
}

function ProjectGridSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Card key={index} className="min-h-[230px] animate-pulse border-slate-200/80 bg-white/70">
          <CardHeader>
            <div className="h-11 w-11 rounded-2xl bg-slate-200" />
            <div className="mt-5 h-5 w-4/5 rounded bg-slate-200" />
            <div className="h-4 w-1/2 rounded bg-slate-100" />
          </CardHeader>
          <CardContent className="mt-8 flex gap-3">
            <div className="h-10 flex-1 rounded-2xl bg-slate-100" />
            <div className="h-10 w-10 rounded-2xl bg-slate-100" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed border-slate-300 bg-white/70">
      <CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-3xl bg-slate-950 text-white shadow-xl shadow-slate-900/[0.15]">
          <Plus className="h-7 w-7" />
        </div>
        <h3 className="mt-6 text-lg font-semibold text-slate-950">Henüz proje yok</h3>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
          İlk kitabını ekleyerek İngilizce-Türkçe sayfa eşleştirme akışını başlatabilirsin.
        </p>
        <Link href="/projects/new" className="mt-6">
          <Button className="rounded-2xl">
            İlk Projeyi Oluştur <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
