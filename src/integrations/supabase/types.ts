export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      campanhas_anuncios: {
        Row: {
          ativo: boolean
          created_at: string
          empreendimento: string | null
          empresa_id: string | null
          grupo_id: string | null
          id: string
          meta_campaign_id: string | null
          nome_campanha: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          empreendimento?: string | null
          empresa_id?: string | null
          grupo_id?: string | null
          id?: string
          meta_campaign_id?: string | null
          nome_campanha: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          empreendimento?: string | null
          empresa_id?: string | null
          grupo_id?: string | null
          id?: string
          meta_campaign_id?: string | null
          nome_campanha?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanhas_anuncios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanhas_anuncios_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
        ]
      }
      config_acesso: {
        Row: {
          empresa_id: string
          hora_fim: string
          hora_inicio: string
          liberado_ate: string | null
          restringir_horario: boolean
          updated_at: string
        }
        Insert: {
          empresa_id: string
          hora_fim?: string
          hora_inicio?: string
          liberado_ate?: string | null
          restringir_horario?: boolean
          updated_at?: string
        }
        Update: {
          empresa_id?: string
          hora_fim?: string
          hora_inicio?: string
          liberado_ate?: string | null
          restringir_horario?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "config_acesso_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      corretores: {
        Row: {
          ativo: boolean
          canal_notificacao: string
          created_at: string
          empresa_id: string | null
          grupo_id: string | null
          id: string
          liberado_ate: string | null
          nome: string
          recebe_via_web: boolean
          recebe_via_whatsapp: boolean
          telefone: string | null
          user_id: string | null
        }
        Insert: {
          ativo?: boolean
          canal_notificacao?: string
          created_at?: string
          empresa_id?: string | null
          grupo_id?: string | null
          id?: string
          liberado_ate?: string | null
          nome: string
          recebe_via_web?: boolean
          recebe_via_whatsapp?: boolean
          telefone?: string | null
          user_id?: string | null
        }
        Update: {
          ativo?: boolean
          canal_notificacao?: string
          created_at?: string
          empresa_id?: string | null
          grupo_id?: string | null
          id?: string
          liberado_ate?: string | null
          nome?: string
          recebe_via_web?: boolean
          recebe_via_whatsapp?: boolean
          telefone?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "corretores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corretores_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
        ]
      }
      empreendimentos: {
        Row: {
          ativo: boolean
          cidade: string | null
          created_at: string
          empresa_id: string | null
          grupo_id: string | null
          id: string
          incorporadora: string | null
          nome: string
        }
        Insert: {
          ativo?: boolean
          cidade?: string | null
          created_at?: string
          empresa_id?: string | null
          grupo_id?: string | null
          id?: string
          incorporadora?: string | null
          nome: string
        }
        Update: {
          ativo?: boolean
          cidade?: string | null
          created_at?: string
          empresa_id?: string | null
          grupo_id?: string | null
          id?: string
          incorporadora?: string | null
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "empreendimentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empreendimentos_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          limite_corretores: number | null
          limite_leads_mes: number | null
          nome: string
          plano: string
          slug: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          limite_corretores?: number | null
          limite_leads_mes?: number | null
          nome: string
          plano?: string
          slug?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          limite_corretores?: number | null
          limite_leads_mes?: number | null
          nome?: string
          plano?: string
          slug?: string | null
        }
        Relationships: []
      }
      fila_notificacoes: {
        Row: {
          corretor_id: string | null
          created_at: string
          empresa_id: string | null
          enviado_em: string | null
          id: string
          lead_id: string | null
          status: string
          tipo: string | null
        }
        Insert: {
          corretor_id?: string | null
          created_at?: string
          empresa_id?: string | null
          enviado_em?: string | null
          id?: string
          lead_id?: string | null
          status?: string
          tipo?: string | null
        }
        Update: {
          corretor_id?: string | null
          created_at?: string
          empresa_id?: string | null
          enviado_em?: string | null
          id?: string
          lead_id?: string | null
          status?: string
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fila_notificacoes_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fila_notificacoes_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "dashboard_corretores"
            referencedColumns: ["corretor_id"]
          },
          {
            foreignKeyName: "fila_notificacoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fila_notificacoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      grupos: {
        Row: {
          created_at: string
          empresa_id: string | null
          id: string
          nome: string
          whatsapp_distribuicao: string | null
          whatsapp_importacao: string | null
        }
        Insert: {
          created_at?: string
          empresa_id?: string | null
          id?: string
          nome: string
          whatsapp_distribuicao?: string | null
          whatsapp_importacao?: string | null
        }
        Update: {
          created_at?: string
          empresa_id?: string | null
          id?: string
          nome?: string
          whatsapp_distribuicao?: string | null
          whatsapp_importacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grupos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      horarios_atendimento: {
        Row: {
          ativo: boolean
          created_at: string
          dia_semana: number
          empresa_id: string | null
          grupo_id: string
          hora_fim: string
          hora_inicio: string
          id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          dia_semana: number
          empresa_id?: string | null
          grupo_id: string
          hora_fim?: string
          hora_inicio?: string
          id?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          dia_semana?: number
          empresa_id?: string | null
          grupo_id?: string
          hora_fim?: string
          hora_inicio?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "horarios_atendimento_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "horarios_atendimento_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notas: {
        Row: {
          autor_id: string | null
          created_at: string
          empresa_id: string | null
          id: string
          lead_id: string
          texto: string
        }
        Insert: {
          autor_id?: string | null
          created_at?: string
          empresa_id?: string | null
          id?: string
          lead_id: string
          texto: string
        }
        Update: {
          autor_id?: string | null
          created_at?: string
          empresa_id?: string | null
          id?: string
          lead_id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          campanha: string | null
          canal: string | null
          cidade: string | null
          codigo_imovel: string | null
          corretor_id: string | null
          corretor_origem_nome: string | null
          created_at: string
          data_atividade: string | null
          email: string | null
          empresa_id: string | null
          etapa_funil: string | null
          fonte: string | null
          grupo_id: string | null
          id: string
          liberado_em: string | null
          motivo_perda: string | null
          nome: string
          observacoes: string | null
          represado_em: string | null
          status: string
          telefone: string | null
          ultima_atividade: string | null
          ultima_atividade_em: string
          valor_negociacao: number | null
          visualizado_em: string | null
        }
        Insert: {
          campanha?: string | null
          canal?: string | null
          cidade?: string | null
          codigo_imovel?: string | null
          corretor_id?: string | null
          corretor_origem_nome?: string | null
          created_at?: string
          data_atividade?: string | null
          email?: string | null
          empresa_id?: string | null
          etapa_funil?: string | null
          fonte?: string | null
          grupo_id?: string | null
          id?: string
          liberado_em?: string | null
          motivo_perda?: string | null
          nome: string
          observacoes?: string | null
          represado_em?: string | null
          status?: string
          telefone?: string | null
          ultima_atividade?: string | null
          ultima_atividade_em?: string
          valor_negociacao?: number | null
          visualizado_em?: string | null
        }
        Update: {
          campanha?: string | null
          canal?: string | null
          cidade?: string | null
          codigo_imovel?: string | null
          corretor_id?: string | null
          corretor_origem_nome?: string | null
          created_at?: string
          data_atividade?: string | null
          email?: string | null
          empresa_id?: string | null
          etapa_funil?: string | null
          fonte?: string | null
          grupo_id?: string | null
          id?: string
          liberado_em?: string | null
          motivo_perda?: string | null
          nome?: string
          observacoes?: string | null
          represado_em?: string | null
          status?: string
          telefone?: string | null
          ultima_atividade?: string | null
          ultima_atividade_em?: string
          valor_negociacao?: number | null
          visualizado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "dashboard_corretores"
            referencedColumns: ["corretor_id"]
          },
          {
            foreignKeyName: "leads_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          created_at: string
          descricao: string | null
          destinatario_id: string
          id: string
          lead_id: string | null
          lida: boolean
          tipo: string
          titulo: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          destinatario_id: string
          id?: string
          lead_id?: string | null
          lida?: boolean
          tipo: string
          titulo: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          destinatario_id?: string
          id?: string
          lead_id?: string | null
          lida?: boolean
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis: {
        Row: {
          corretor_id: string | null
          created_at: string
          empresa_id: string | null
          grupo_id: string | null
          id: string
          nome: string | null
          role: string
          super_admin: boolean
        }
        Insert: {
          corretor_id?: string | null
          created_at?: string
          empresa_id?: string | null
          grupo_id?: string | null
          id: string
          nome?: string | null
          role?: string
          super_admin?: boolean
        }
        Update: {
          corretor_id?: string | null
          created_at?: string
          empresa_id?: string | null
          grupo_id?: string | null
          id?: string
          nome?: string | null
          role?: string
          super_admin?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "perfis_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfis_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "dashboard_corretores"
            referencedColumns: ["corretor_id"]
          },
          {
            foreignKeyName: "perfis_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfis_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
        ]
      }
      propostas: {
        Row: {
          atualizado_em: string
          condicoes: string | null
          corretor_id: string | null
          created_at: string
          empresa_id: string | null
          id: string
          lead_id: string
          motivo_recusa: string | null
          observacoes: string | null
          parcelas: number | null
          status: string
          unidade_id: string | null
          valor_entrada: number | null
          valor_proposto: number
        }
        Insert: {
          atualizado_em?: string
          condicoes?: string | null
          corretor_id?: string | null
          created_at?: string
          empresa_id?: string | null
          id?: string
          lead_id: string
          motivo_recusa?: string | null
          observacoes?: string | null
          parcelas?: number | null
          status?: string
          unidade_id?: string | null
          valor_entrada?: number | null
          valor_proposto: number
        }
        Update: {
          atualizado_em?: string
          condicoes?: string | null
          corretor_id?: string | null
          created_at?: string
          empresa_id?: string | null
          id?: string
          lead_id?: string
          motivo_recusa?: string | null
          observacoes?: string | null
          parcelas?: number | null
          status?: string
          unidade_id?: string | null
          valor_entrada?: number | null
          valor_proposto?: number
        }
        Relationships: [
          {
            foreignKeyName: "propostas_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "dashboard_corretores"
            referencedColumns: ["corretor_id"]
          },
          {
            foreignKeyName: "propostas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      unidades: {
        Row: {
          andar: number
          area_m2: number | null
          cliente_nome: string | null
          corretor_id: string | null
          created_at: string
          empreendimento_id: string
          empresa_id: string | null
          id: string
          lead_id: string | null
          numero: string
          observacoes: string | null
          reservado_em: string | null
          status: string
          tipologia: string | null
          torre: string
          valor: number | null
        }
        Insert: {
          andar?: number
          area_m2?: number | null
          cliente_nome?: string | null
          corretor_id?: string | null
          created_at?: string
          empreendimento_id: string
          empresa_id?: string | null
          id?: string
          lead_id?: string | null
          numero: string
          observacoes?: string | null
          reservado_em?: string | null
          status?: string
          tipologia?: string | null
          torre?: string
          valor?: number | null
        }
        Update: {
          andar?: number
          area_m2?: number | null
          cliente_nome?: string | null
          corretor_id?: string | null
          created_at?: string
          empreendimento_id?: string
          empresa_id?: string | null
          id?: string
          lead_id?: string | null
          numero?: string
          observacoes?: string | null
          reservado_em?: string | null
          status?: string
          tipologia?: string | null
          torre?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "unidades_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidades_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "dashboard_corretores"
            referencedColumns: ["corretor_id"]
          },
          {
            foreignKeyName: "unidades_empreendimento_id_fkey"
            columns: ["empreendimento_id"]
            isOneToOne: false
            referencedRelation: "empreendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidades_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidades_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      dashboard_corretores: {
        Row: {
          corretor: string | null
          corretor_id: string | null
          grupo: string | null
          grupo_id: string | null
          total_leads: number | null
          ultimo_lead_recebido: string | null
        }
        Relationships: [
          {
            foreignKeyName: "corretores_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      dentro_do_horario: { Args: { p_grupo_id: string }; Returns: boolean }
      distribuir_lead_direcionado:
        | {
            Args: {
              p_corretores_ids: string[]
              p_email: string
              p_grupo_id: string
              p_nome: string
              p_telefone: string
            }
            Returns: string
          }
        | {
            Args: {
              p_corretores_ids: string[]
              p_email: string
              p_extra?: Json
              p_grupo_id: string
              p_nome: string
              p_telefone: string
            }
            Returns: string
          }
      distribuir_lead_round_robin: {
        Args: {
          p_email: string
          p_extra?: Json
          p_grupo_id: string
          p_nome: string
          p_telefone: string
        }
        Returns: string
      }
      get_meu_corretor_id: { Args: never; Returns: string }
      get_minha_empresa_id: { Args: never; Returns: string }
      get_my_profile: {
        Args: never
        Returns: {
          grupo_id: string
          role: string
        }[]
      }
      liberar_leads_inativos_6d: { Args: never; Returns: undefined }
      liberar_leads_represados: { Args: never; Returns: undefined }
      liberar_unidade: { Args: { p_unidade_id: string }; Returns: undefined }
      reatribuir_leads_sem_visualizacao: { Args: never; Returns: undefined }
      registrar_login_corretor: { Args: never; Returns: undefined }
      reservar_unidade: {
        Args: {
          p_cliente_nome?: string
          p_lead_id?: string
          p_unidade_id: string
        }
        Returns: undefined
      }
      sou_corretor_do_lead: { Args: { p_lead_id: string }; Returns: boolean }
      sou_super_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
