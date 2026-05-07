export interface Project {
  id: string;
  name: string;
  description: string;
  user_id: string;
  mlflow_experiment_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectCreate {
  name: string;
  description: string;
}
