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
      compromissos: {
        Row: {
          concluido: boolean
          created_at: string
          data_hora: string
          id: string
          lead_id: string | null
          notas: string | null
          tipo: Database["public"]["Enums"]["compromisso_tipo"]
          titulo: string
        }
        Insert: {
          concluido?: boolean
          created_at?: string
          data_hora: string
          id?: string
          lead_id?: string | null
          notas?: string | null
          tipo: Database["public"]["Enums"]["compromisso_tipo"]
          titulo: string
        }
        Update: {
          concluido?: boolean
          created_at?: string
          data_hora?: string
          id?: string
          lead_id?: string | null
          notas?: string | null
          tipo?: Database["public"]["Enums"]["compromisso_tipo"]
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "compromissos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      consultores: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          numero_whatsapp: string
          ordem_rodizio: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          numero_whatsapp: string
          ordem_rodizio?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          numero_whatsapp?: string
          ordem_rodizio?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          consultor_id: string | null
          created_at: string
          estagio: Database["public"]["Enums"]["lead_estagio"]
          id: string
          interesse: string | null
          nome: string
          notas: string | null
          origem: string
          telefone: string
          updated_at: string
          valor_estimado: number | null
        }
        Insert: {
          consultor_id?: string | null
          created_at?: string
          estagio?: Database["public"]["Enums"]["lead_estagio"]
          id?: string
          interesse?: string | null
          nome: string
          notas?: string | null
          origem?: string
          telefone: string
          updated_at?: string
          valor_estimado?: number | null
        }
        Update: {
          consultor_id?: string | null
          created_at?: string
          estagio?: Database["public"]["Enums"]["lead_estagio"]
          id?: string
          interesse?: string | null
          nome?: string
          notas?: string | null
          origem?: string
          telefone?: string
          updated_at?: string
          valor_estimado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_consultor_id_fkey"
            columns: ["consultor_id"]
            isOneToOne: false
            referencedRelation: "consultores"
            referencedColumns: ["id"]
          },
        ]
      }
      rodizio_estado: {
        Row: {
          id: number
          ultimo_consultor_id: string | null
          updated_at: string
        }
        Insert: {
          id?: number
          ultimo_consultor_id?: string | null
          updated_at?: string
        }
        Update: {
          id?: number
          ultimo_consultor_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rodizio_estado_ultimo_consultor_id_fkey"
            columns: ["ultimo_consultor_id"]
            isOneToOne: false
            referencedRelation: "consultores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_consultor_id: { Args: never; Returns: string }
      escolher_proximo_consultor: {
        Args: never
        Returns: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          numero_whatsapp: string
          ordem_rodizio: number
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "consultores"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_email: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
      compromisso_tipo: "visita" | "ligacao" | "reuniao"
      lead_estagio: "novo" | "em_contato" | "proposta" | "fechado" | "perdido"
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
    Enums: {
      app_role: ["admin", "user"],
      compromisso_tipo: ["visita", "ligacao", "reuniao"],
      lead_estagio: ["novo", "em_contato", "proposta", "fechado", "perdido"],
    },
  },
} as const
