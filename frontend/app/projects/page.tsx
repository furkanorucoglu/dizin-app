"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/backend-http";

type Project = {
  id: string;
  title?: string;
  name?: string;
  status?: string;
  created_at?: string;
  createdAt?: string;
  entries_count?: number;
  entry_count?: number;
};

function projectTitle(project: Project) {
  return project.title || project.name || "İsimsiz proje";
}

function projectDate(project: Project) {
  const value = project.created_at || project.createdAt;
  if (!value) return "-";

  try {
    return new Intl.DateTimeFormat("tr-TR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadProjects() {
    setLoading(true);
    setError(null);

    try {
      const data = await apiFetch<Project[] | { projects?: Project[] }>("/api/projects");
      const list = Array.isArray(data) ? data : data.projects ?? [];
      setProjects(list);
    } catch (err: any) {
      setError(err?.message || "Projeler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-500">Dizin Studio</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
              Projeler
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Yüklediğin dizin projelerini buradan inceleyebilir ve export alabilirsin.
            </p>
          </div>

          <Link
            href="/projects/new"
            className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            Yeni proje oluştur
          </Link>
        </div>

        {loading && (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-slate-600 shadow-sm">
            Projeler yükleniyor...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-red-700 shadow-sm">
            {error}
          </div>
        )}

        {!loading && !error && projects.length === 0 && (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Henüz proje yok</h2>
            <p className="mt-2 text-sm text-slate-600">
              İlk projen için EN PDF, TR PDF ve dizin DOCX dosyalarını yükleyebilirsin.
            </p>
            <Link
              href="/projects/new"
              className="mt-5 inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              İlk projeyi oluştur
            </Link>
          </div>
        )}

        {!loading && !error && projects.length > 0 && (
          <div className="grid gap-4">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="block rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">
                      {projectTitle(project)}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Oluşturulma: {projectDate(project)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 text-sm">
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                      {project.status || "durum yok"}
                    </span>
                    <span className="text-slate-500">
                      {project.entries_count ?? project.entry_count ?? 0} kayıt
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
