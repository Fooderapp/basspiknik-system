"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Code2, Copy, CheckCircle2, ExternalLink } from "lucide-react";

interface Props {
  slug: string;
}

export function EmbedSnippet({ slug }: Props) {
  const [copied, setCopied] = useState(false);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const widgetUrl = `${appUrl}/widget/${slug}`;

  const snippet = `<iframe
  src="${widgetUrl}"
  width="100%"
  height="520"
  style="border:none;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);"
  title="Ticket Purchase"
  loading="lazy"
></iframe>`;

  const copy = () => {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    toast.success("Embed code copied!");
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Code2 className="h-4 w-4" /> Embed on Your Website
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Paste this snippet anywhere on your site to embed the ticket selector in an iframe.
        </p>
        <div className="relative rounded-lg bg-muted font-mono text-xs p-4 pr-12 overflow-x-auto whitespace-pre">
          {snippet}
          <Button
            size="icon"
            variant="ghost"
            className="absolute top-2 right-2 h-7 w-7"
            onClick={copy}
          >
            {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={widgetUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Preview widget
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
