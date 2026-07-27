CREATE POLICY "docs_propostas_update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'documentos-propostas' AND (
    public.pode_dar_suporte() OR
    EXISTS (
      SELECT 1 FROM public.documentos_propostas d
      WHERE d.storage_path = name
        AND (SELECT role FROM public.get_my_profile()) <> 'corretor'
        AND public.posso_acessar_proposta(d.proposta_id)
    )
  )
)
WITH CHECK (
  bucket_id = 'documentos-propostas' AND (
    public.pode_dar_suporte() OR
    EXISTS (
      SELECT 1 FROM public.documentos_propostas d
      WHERE d.storage_path = name
        AND (SELECT role FROM public.get_my_profile()) <> 'corretor'
        AND public.posso_acessar_proposta(d.proposta_id)
    )
  )
);