/**
 * Types de la base (schéma public), écrits à la main sur le modèle de
 * `supabase gen types typescript`. À tenir à jour avec supabase/migrations.
 */
import type { HrZone } from '../domain/zones.ts'

export type UserRole = 'coach' | 'athlete'
export type LinkStatus = 'active' | 'archived'
export type InvitationStatus = 'valid' | 'accepted' | 'expired' | 'revoked'

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          role: UserRole
          full_name: string
          email: string
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: { full_name?: string }
        Relationships: []
      }
      coach_athletes: {
        Row: {
          coach_id: string
          athlete_id: string
          status: LinkStatus
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: { status?: LinkStatus }
        Relationships: []
      }
      invitations: {
        Row: {
          id: string
          coach_id: string
          token: string
          athlete_name: string
          expires_at: string
          accepted_by: string | null
          accepted_at: string | null
          revoked_at: string | null
          created_at: string
        }
        Insert: { athlete_name?: string }
        Update: { revoked_at?: string | null }
        Relationships: []
      }
      athlete_profiles: {
        Row: {
          athlete_id: string
          birth_year: number | null
          goals: string
          injuries: string
          availability: string
          hr_max: number | null
          hr_rest: number | null
          hr_threshold: number | null
          vma_kmh: number | null
          zones: HrZone[]
          zones_updated_at: string | null
          updated_at: string
        }
        Insert: never
        Update: {
          birth_year?: number | null
          goals?: string
          injuries?: string
          availability?: string
          hr_max?: number | null
          hr_rest?: number | null
          hr_threshold?: number | null
          vma_kmh?: number | null
          zones?: HrZone[]
        }
        Relationships: []
      }
      athlete_metrics_history: {
        Row: {
          id: number
          athlete_id: string
          recorded_at: string
          recorded_by: string | null
          hr_max: number | null
          hr_rest: number | null
          hr_threshold: number | null
          vma_kmh: number | null
          zones: HrZone[]
        }
        Insert: never
        Update: never
        Relationships: []
      }
      coach_private_notes: {
        Row: {
          coach_id: string
          athlete_id: string
          body: string
          updated_at: string
        }
        Insert: never
        Update: { body?: string }
        Relationships: []
      }
    }
    Views: {
      coach_links: {
        Row: {
          coach_id: string
          athlete_id: string
          status: LinkStatus
          linked_at: string
          coach_name: string
          coach_email: string
          athlete_name: string
          athlete_email: string
        }
        Relationships: []
      }
    }
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string }
      get_invitation: {
        Args: { p_token: string }
        Returns: { coach_name: string; athlete_name: string; status: InvitationStatus }[]
      }
      is_coach_of: { Args: { p_athlete: string }; Returns: boolean }
      is_my_coach: { Args: { p_coach: string }; Returns: boolean }
      my_role: { Args: Record<PropertyKey, never>; Returns: UserRole }
    }
    Enums: { user_role: UserRole }
    CompositeTypes: Record<PropertyKey, never>
  }
}

type PublicSchema = Database['public']
export type Profile = PublicSchema['Tables']['profiles']['Row']
export type Invitation = PublicSchema['Tables']['invitations']['Row']
export type AthleteProfile = PublicSchema['Tables']['athlete_profiles']['Row']
export type AthleteProfileUpdate = PublicSchema['Tables']['athlete_profiles']['Update']
export type CoachLink = PublicSchema['Views']['coach_links']['Row']
