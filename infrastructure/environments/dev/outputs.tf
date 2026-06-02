output "frontend_url" {
  value = module.frontend.cloudfront_url
}

output "api_url" {
  value = module.api.api_url
}

output "avatar_bucket" {
  value = module.frontend.avatar_bucket_name
}
