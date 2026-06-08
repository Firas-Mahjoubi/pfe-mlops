import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { adminGuard } from './core/auth/admin.guard';
import { DashboardLayoutComponent } from './shared/layouts/dashboard-layout/dashboard-layout.component';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/auth/login/login.component').then(m => m.LoginComponent) },
  { path: 'signup', loadComponent: () => import('./pages/auth/signup/signup.component').then(m => m.SignupComponent) },
  {
    path: '',
    component: DashboardLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'projects', loadComponent: () => import('./pages/projects/project-list/project-list.component').then(m => m.ProjectListComponent) },
      { path: 'projects/:id', loadComponent: () => import('./pages/projects/project-detail/project-detail.component').then(m => m.ProjectDetailComponent) },
      { path: 'experiments', loadComponent: () => import('./pages/experiments/experiment-list.component').then(m => m.ExperimentListComponent) },
      { path: 'pipelines', loadComponent: () => import('./pages/pipelines/pipeline-list.component').then(m => m.PipelineListComponent) },
      { path: 'models', loadComponent: () => import('./pages/models/model-list.component').then(m => m.ModelListComponent) },
      { path: 'deployments', loadComponent: () => import('./pages/deployments/deployment-list.component').then(m => m.DeploymentListComponent) },
      { path: 'features', loadComponent: () => import('./pages/data/feature-store.component').then(m => m.FeatureStoreComponent) },
      { path: 'datasets', loadComponent: () => import('./pages/data/datasets.component').then(m => m.DatasetsComponent) },
      { path: 'artifacts', loadComponent: () => import('./pages/data/artifacts.component').then(m => m.ArtifactsComponent) },
      { path: 'monitoring', loadComponent: () => import('./pages/data/monitoring.component').then(m => m.MonitoringComponent) },
      { path: 'runs/compare', loadComponent: () => import('./pages/runs/run-compare/run-compare.component').then(m => m.RunCompareComponent) },
      { path: 'admin', canActivate: [adminGuard], loadComponent: () => import('./pages/admin/admin-overview.component').then(m => m.AdminOverviewComponent) },
      { path: 'admin/users', canActivate: [adminGuard], loadComponent: () => import('./pages/admin/admin-users.component').then(m => m.AdminUsersComponent) },
      { path: 'admin/resources', canActivate: [adminGuard], loadComponent: () => import('./pages/admin/admin-resources.component').then(m => m.AdminResourcesComponent) },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
