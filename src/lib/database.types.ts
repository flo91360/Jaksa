/**
 * Types de la base (schéma public), écrits à la main sur le modèle de
 * `supabase gen types typescript`. À tenir à jour avec supabase/migrations.
 */
import type { FeedbackStatus, Pain } from '../domain/feedback.ts'
import type { GarminActivityValues } from '../domain/garmin.ts'
import type { ActivityDetail } from '../domain/activityDetail.ts'
import type { RacePriority } from '../domain/planning.ts'
import type { WorkoutItem, WorkoutKind } from '../domain/workouts.ts'
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
          email_notifications: boolean
          /** Version des conditions acceptées (0.7.0) ; null tant que l'accord n'est pas donné. */
          terms_version: string | null
          terms_accepted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: { full_name?: string; email_notifications?: boolean }
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
      workouts: {
        Row: {
          id: string
          athlete_id: string
          coach_id: string
          scheduled_on: string
          position: number
          kind: WorkoutKind
          title: string
          description: string
          steps: WorkoutItem[]
          created_at: string
          updated_at: string
        }
        Insert: {
          athlete_id: string
          scheduled_on: string
          position?: number
          kind?: WorkoutKind
          title: string
          description?: string
          steps?: WorkoutItem[]
        }
        Update: {
          scheduled_on?: string
          position?: number
          kind?: WorkoutKind
          title?: string
          description?: string
          steps?: WorkoutItem[]
        }
        Relationships: []
      }
      workout_templates: {
        Row: {
          id: string
          coach_id: string
          kind: WorkoutKind
          title: string
          description: string
          steps: WorkoutItem[]
          created_at: string
          updated_at: string
        }
        Insert: { kind?: WorkoutKind; title: string; description?: string; steps?: WorkoutItem[] }
        Update: { kind?: WorkoutKind; title?: string; description?: string; steps?: WorkoutItem[] }
        Relationships: []
      }
      races: {
        Row: {
          id: string
          athlete_id: string
          created_by: string | null
          race_on: string
          name: string
          priority: RacePriority
          distance_km: number | null
          elevation_gain_m: number | null
          notes: string
          created_at: string
          updated_at: string
        }
        Insert: {
          athlete_id: string
          race_on: string
          name: string
          priority?: RacePriority
          distance_km?: number | null
          elevation_gain_m?: number | null
          notes?: string
        }
        Update: {
          race_on?: string
          name?: string
          priority?: RacePriority
          distance_km?: number | null
          elevation_gain_m?: number | null
          notes?: string
        }
        Relationships: []
      }
      workout_feedback: {
        Row: {
          workout_id: string
          athlete_id: string
          status: FeedbackStatus
          duration_s: number | null
          distance_m: number | null
          elevation_gain_m: number | null
          rpe: number | null
          pain: Pain[]
          coach_seen_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          workout_id: string
          status: FeedbackStatus
          duration_s?: number | null
          distance_m?: number | null
          elevation_gain_m?: number | null
          rpe?: number | null
          pain?: Pain[]
        }
        Update: {
          status?: FeedbackStatus
          duration_s?: number | null
          distance_m?: number | null
          elevation_gain_m?: number | null
          rpe?: number | null
          pain?: Pain[]
        }
        Relationships: []
      }
      garmin_activities: {
        Row: Omit<GarminActivityValues, 'garmin_activity_id'> & {
          id: string
          athlete_id: string
          /** bigint : PostgREST le renvoie en nombre (les identifiants Garmin restent sous 2^53). */
          garmin_activity_id: number
          workout_id: string | null
          imported_at: string
        }
        Insert: GarminActivityValues & { workout_id?: string | null }
        Update: Partial<GarminActivityValues> & { workout_id?: string | null }
        Relationships: []
      }
      /** Détail d'une activité (.FIT), écrit seulement par la fonction garmin-sync. */
      garmin_activity_details: {
        Row: {
          activity_id: string
          athlete_id: string
          status: 'ok' | 'no_file' | 'unreadable'
          /** Présent quand status = 'ok' ; à relire avec isActivityDetail. */
          data: ActivityDetail | null
          /** Raison d'un échec (« HTTP 403 »…), pour le diagnostic (0.5.1). */
          error: string | null
          fetched_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      garmin_sync_runs: {
        Row: {
          id: number
          athlete_id: string | null
          ran_at: string
          status: 'ok' | 'unknown_athlete' | 'garmin_key_rejected' | 'garmin_unavailable' | 'save_failed'
          imported: number
          linked: number
          /** Fichiers .FIT lus pendant ce passage (0.5.0). */
          details: number
          /** Premier échec de lecture d'un .FIT pendant ce passage (0.5.1). */
          detail_error: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      /** Journal des erreurs du site (0.7.0) : aucun droit depuis le site, écrit par report_client_error. */
      client_errors: {
        Row: {
          id: number
          user_id: string | null
          occurred_at: string
          app_version: string
          path: string
          message: string
          stack: string
          user_agent: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      workout_comments: {
        Row: {
          id: string
          workout_id: string
          athlete_id: string
          author_id: string
          body: string
          read_at: string | null
          created_at: string
        }
        Insert: { workout_id: string; body: string }
        Update: never
        Relationships: []
      }
      messages: {
        Row: {
          id: string
          coach_id: string
          athlete_id: string
          sender_id: string
          body: string
          read_at: string | null
          created_at: string
        }
        Insert: { coach_id: string; athlete_id: string; body: string }
        Update: never
        Relationships: []
      }
    }
    Views: {
      workout_activity: {
        Row: {
          workout_id: string
          athlete_id: string
          coach_id: string
          scheduled_on: string
          kind: WorkoutKind
          title: string
          status: FeedbackStatus | null
          duration_s: number | null
          distance_m: number | null
          elevation_gain_m: number | null
          rpe: number | null
          pain: Pain[]
          feedback_at: string | null
          coach_seen_at: string | null
          unseen_feedback: boolean
          comment_count: number
          unread_comments: number
          last_comment_at: string | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          coach_id: string
          athlete_id: string
          status: LinkStatus
          coach_name: string
          athlete_name: string
          athlete_email: string
          last_body: string | null
          last_sender_id: string | null
          last_message_at: string | null
          unread_count: number
        }
        Relationships: []
      }
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
      accept_terms: { Args: { p_version: string }; Returns: undefined }
      leave_coach: { Args: { p_coach: string }; Returns: undefined }
      delete_my_account: { Args: Record<PropertyKey, never>; Returns: undefined }
      report_client_error: {
        Args: { p_message: string; p_stack?: string; p_path?: string; p_version?: string; p_user_agent?: string }
        Returns: undefined
      }
      get_invitation: {
        Args: { p_token: string }
        Returns: { coach_name: string; athlete_name: string; status: InvitationStatus }[]
      }
      mark_conversation_read: { Args: { p_coach: string; p_athlete: string }; Returns: undefined }
      mark_workout_seen: { Args: { p_workout: string }; Returns: undefined }
      is_coach_of: { Args: { p_athlete: string }; Returns: boolean }
      is_my_coach: { Args: { p_coach: string }; Returns: boolean }
      my_role: { Args: Record<PropertyKey, never>; Returns: UserRole }
      workout_steps_are_valid: { Args: { items: WorkoutItem[] }; Returns: boolean }
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
export type Workout = PublicSchema['Tables']['workouts']['Row']
export type WorkoutInsert = PublicSchema['Tables']['workouts']['Insert']
export type WorkoutUpdate = PublicSchema['Tables']['workouts']['Update']
export type WorkoutTemplate = PublicSchema['Tables']['workout_templates']['Row']
export type WorkoutTemplateInsert = PublicSchema['Tables']['workout_templates']['Insert']
export type Race = PublicSchema['Tables']['races']['Row']
export type RaceInsert = PublicSchema['Tables']['races']['Insert']
export type RaceUpdate = PublicSchema['Tables']['races']['Update']
export type WorkoutFeedback = PublicSchema['Tables']['workout_feedback']['Row']
export type WorkoutFeedbackInsert = PublicSchema['Tables']['workout_feedback']['Insert']
export type WorkoutComment = PublicSchema['Tables']['workout_comments']['Row']
export type Message = PublicSchema['Tables']['messages']['Row']
export type WorkoutActivity = PublicSchema['Views']['workout_activity']['Row']
export type Conversation = PublicSchema['Views']['conversations']['Row']
export type GarminActivity = PublicSchema['Tables']['garmin_activities']['Row']
export type GarminActivityInsert = PublicSchema['Tables']['garmin_activities']['Insert']
export type GarminActivityDetailRow = PublicSchema['Tables']['garmin_activity_details']['Row']
export type GarminSyncRun = PublicSchema['Tables']['garmin_sync_runs']['Row']
