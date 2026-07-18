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
          grupo_id: string | null
          id: string
          meta_campaign_id: string | null
          nome_campanha: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          empreendimento?: string | null
          grupo_id?: string | null
          id?: string
          meta_campaign_id?: string | null
          nome_campanha: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          empreendimento?: string | null
          grupo_id?: string | null
          id?: string
          meta_campaign_id?: string | null
          nome_campanha?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanhas_anuncios_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
        ]
      }
      corretores: {
        Row: {
          ativo: boolean
          canal_notificacao: string
          created_at: string
          grupo_id: string | null
          id: string
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
          grupo_id?: string | null
          id?: string
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
          grupo_id?: string | null
          id?: string
          nome?: string
          recebe_via_web?: boolean
          recebe_via_whatsapp?: boolean
          telefone?: string | null
          user_id?: string | null
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
      fila_notificacoes: {
        Row: {
          corretor_id: string | null
          created_at: string
          enviado_em: string | null
          id: string
          lead_id: string | null
          status: string
          tipo: string | null
        }
        Insert: {
          corretor_id?: string | null
          created_at?: string
          enviado_em?: string | null
          id?: string
          lead_id?: string | null
          status?: string
          tipo?: string | null
        }
        Update: {
          corretor_id?: string | null
          created_at?: string
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
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      horarios_atendimento: {
        Row: {
          ativo: boolean
          created_at: string
          dia_semana: number
          grupo_id: string
          hora_fim: string
          hora_inicio: string
          id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          dia_semana: number
          grupo_id: string
          hora_fim?: string
          hora_inicio?: string
          id?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          dia_semana?: number
          grupo_id?: string
          hora_fim?: string
          hora_inicio?: string
          id?: string
        }
        Relationships: [
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
          id: string
          lead_id: string
          texto: string
        }
        Insert: {
          autor_id?: string | null
          created_at?: string
          id?: string
          lead_id: string
          texto: string
        }
        Update: {
          autor_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          texto?: string
        }
        Relationships: [
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
          corretor_id: string | null
          created_at: string
          email: string | null
          grupo_id: string | null
          id: string
          liberado_em: string | null
          nome: string
          represado_em: string | null
          status: string
          telefone: string | null
          ultima_atividade_em: string
          visualizado_em: string | null
        }
        Insert: {
          corretor_id?: string | null
          created_at?: string
          email?: string | null
          grupo_id?: string | null
          id?: string
          liberado_em?: string | null
          nome: string
          represado_em?: string | null
          status?: string
          telefone?: string | null
          ultima_atividade_em?: string
          visualizado_em?: string | null
        }
        Update: {
          corretor_id?: string | null
          created_at?: string
          email?: string | null
          grupo_id?: string | null
          id?: string
          liberado_em?: string | null
          nome?: string
          represado_em?: string | null
          status?: string
          telefone?: string | null
          ultima_atividade_em?: string
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
          created_at: string
          grupo_id: string | null
          id: string
          nome: string | null
          role: string
        }
        Insert: {
          created_at?: string
          grupo_id?: string | null
          id: string
          nome?: string | null
          role?: string
        }
        Update: {
          created_at?: string
          grupo_id?: string | null
          id?: string
          nome?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfis_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
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
      distribuir_lead_direcionado: {
        Args: {
          p_corretores_ids: string[]
          p_email: string
          p_grupo_id: string
          p_nome: string
          p_telefone: string
        }
        Returns: string
      }
      distribuir_lead_round_robin: {
        Args: {
          p_email: string
          p_grupo_id: string
          p_nome: string
          p_telefone: string
        }
        Returns: string
      }
      get_my_profile: {
        Args: never
        Returns: {
          grupo_id: string
          role: string
        }[]
      }
      liberar_leads_inativos_6d: { Args: never; Returns: undefined }
      liberar_leads_represados: { Args: never; Returns: undefined }
      reatribuir_leads_sem_visualizacao: { Args: never; Returns: undefined }
      registrar_login_corretor: { Args: never; Returns: undefined }
      sou_corretor_do_lead: { Args: { p_lead_id: string }; Returns: boolean }
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
