#!/usr/bin/env bash

# build-opencode.sh
#
# Build script for the opencode package
#
# Usage: ./script-build/build-opencode.sh [VERSION] [options]
#
# Arguments:
#   VERSION    Release version (e.g., v1.2.16, 1.2.16)
#              If not provided, reads from packages/opencode/package.json and
#              calculates fork version using: patch + 100000 + (build_count * 1000)
#              Example: official 1.3.99 -> fork 1.3.100099, 1.3.101099, 1.3.102099...
#
# Options:
#   --validate  Dry-run mode - only run validations, no release
#   -h, --help  Show this help message
#

set -euo pipefail

# Get absolute path to script directory (once at script start)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Utility functions


# Utility functions

log_info() {
    local message="$1"
    local timestamp
    timestamp=$(date +"%Y-%m-%d %H:%M:%S")
    echo "${timestamp} [INFO] ${message}" >&2
}

log_error() {
    local message="$1"
    local timestamp
    timestamp=$(date +"%Y-%m-%d %H:%M:%S")
    echo "${timestamp} [ERROR] ${message}" >&2
    return 1
}

cleanup() {
    local exit_code=$?
    if [[ ${exit_code} -ne 0 ]]; then
        local timestamp
        timestamp=$(date +"%Y-%m-%d %H:%M:%S")
        echo "${timestamp} [ERROR] Script exited with error code ${exit_code}" >&2
    fi
    exit "${exit_code}"
}
# Trap signals for cleanup
trap cleanup ERR EXIT INT

# Helper function to build gh repo argument
# Usage: gh_repo_arg "owner/repo" returns "-R owner/repo" or empty string
build_gh_repo_arg() {
    local repo="$1"
    if [[ -n "${repo}" ]]; then
        echo "-R ${repo}"
    fi
}

restore_official_version() {
    local my_version="$1"
    local major minor patch build
    IFS='.' read -r major minor patch build <<< "${my_version#v}"
    
    if [[ -n "${build}" ]]; then
        echo "${major}.${minor}.${patch}"
        return 0
    fi
    
    if [[ ${patch} -lt 100000 ]]; then
        echo "${major}.${minor}.${patch}"
        return 0
    fi
    
    local official_patch=$(( (patch - 100000) % 1000 ))
    echo "${major}.${minor}.${official_patch}"
}

compute_fork_version() {
    local official_version="$1"
    local build_count="$2"
    local major minor patch
    IFS='.' read -r major minor patch <<< "${official_version}"
    local fork_patch=$(( 100000 + patch + (build_count * 1000) ))
    echo "${major}.${minor}.${fork_patch}"
}

compare_versions() {
    local v1="$1"
    local v2="$2"
    local major1 minor1 patch1 major2 minor2 patch2
    IFS='.' read -r major1 minor1 patch1 <<< "${v1}"
    IFS='.' read -r major2 minor2 patch2 <<< "${v2}"
    
    if [[ ${major1} -gt ${major2} ]]; then echo "gt"; return 0; fi
    if [[ ${major1} -lt ${major2} ]]; then echo "lt"; return 0; fi
    if [[ ${minor1} -gt ${minor2} ]]; then echo "gt"; return 0; fi
    if [[ ${minor1} -lt ${minor2} ]]; then echo "lt"; return 0; fi
    if [[ ${patch1} -gt ${patch2} ]]; then echo "gt"; return 0; fi
    if [[ ${patch1} -lt ${patch2} ]]; then echo "lt"; return 0; fi
    echo "eq"
}

get_latest_release_tag() {
    local repo="$1"
    local repo_arg
    repo_arg=$(build_gh_repo_arg "${repo}")
    local releases_json
    releases_json=$(gh ${repo_arg} release list --limit 100 --json tagName,isDraft,isPrerelease 2>/dev/null)
    
    if [[ -z "${releases_json}" || "${releases_json}" == "[]" ]]; then
        echo ""
        return 0
    fi
    
    local latest_tag
    latest_tag=$(echo "${releases_json}" | jq -r '
        [.[] | select(.isDraft == false and .isPrerelease == false)] |
        [.[] | .tagName] |
        .[]' | while read -r tag; do
            local ver="${tag#v}"
            local major minor patch build
            IFS='.' read -r major minor patch build <<< "${ver}"
            if [[ -z "${build}" ]]; then
                build=0
            fi
            printf "%d.%d.%d.%d|%s\n" "${major}" "${minor}" "${patch}" "${build}" "${tag}"
        done | sort -t'|' -k1 -Vr | head -1 | cut -d'|' -f2)
    
    if [[ -n "${latest_tag}" ]]; then
        echo "${latest_tag}"
    else
        echo ""
    fi
}

find_next_version() {
    local pkg_version="$1"
    local repo="$2"
    local repo_arg
    repo_arg=$(build_gh_repo_arg "${repo}")
    
    local latest_tag
    latest_tag=$(get_latest_release_tag "${repo}")
    
    if [[ -z "${latest_tag}" ]]; then
        log_info "No existing releases found, creating first release based on package.json version"
        compute_fork_version "${pkg_version}" 0
        return 0
    fi
    
    local latest_version="${latest_tag#v}"
    local restored_official
    restored_official=$(restore_official_version "${latest_version}")
    
    log_info "Latest release: ${latest_version} -> restored official: ${restored_official}"
    log_info "Package.json version: ${pkg_version}"
    
    local cmp
    cmp=$(compare_versions "${pkg_version}" "${restored_official}")
    
    case "${cmp}" in
        "gt")
            log_info "Package.json version is newer, starting fresh fork version"
            compute_fork_version "${pkg_version}" 0
            ;;
        "eq")
            log_info "Versions equal, incrementing build count"
            local major minor patch build
            IFS='.' read -r major minor patch build <<< "${latest_version}"
            local latest_patch=${patch}
            
            if [[ -n "${build}" ]]; then
                log_info "Old 4-segment format detected, treating as first fork"
                compute_fork_version "${pkg_version}" 0
            else
                local build_count=$(( (latest_patch - 100000) / 1000 ))
                local new_build_count=$((build_count + 1))
                compute_fork_version "${pkg_version}" ${new_build_count}
            fi
            ;;
        "lt")
            log_error "Package.json version (${pkg_version}) is older than latest release restored version (${restored_official})"
            log_error "Please update packages/opencode/package.json to a newer version"
            return 1
            ;;
    esac
}

# Validation functions

validate_version() {
    local version="$1"
    if [[ ! "${version}" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?(-[a-zA-Z0-9]+)?$ ]]; then
        log_error "Invalid version format: ${version}\nExpected format: v1.2.16, 1.2.16, 1.2.16.1, or 1.2.16.1-buwai"
        return 1
    fi
    log_info "Version validated: ${version}"
}

check_gh_cli() {
    if ! command -v gh &> /dev/null; then
        log_error "gh CLI is not installed\nPlease install from: https://cli.github.com/"
        return 1
    fi
    log_info "gh CLI found: $(command -v gh)"
}

check_gh_auth() {
    if ! gh auth status &> /dev/null; then
        log_error "gh CLI is not authenticated\nPlease run: gh auth login"
        return 1
    fi
    log_info "gh CLI authentication verified"
}

detect_git_repo() {
    local repo
    local remote_url
    
    # Try to get remote URL from git
    if ! command -v git &> /dev/null; then
        log_info "git not found, will use gh CLI default repository"
        return 0
    fi
    
    if ! git rev-parse --git-dir &> /dev/null; then
        log_info "Not in a git repository, will use gh CLI default repository"
        return 0
    fi
    
    # Get remote URL (prefer origin)
    remote_url=$(git remote get-url origin 2>/dev/null)
    if [[ -z "${remote_url}" ]]; then
        # Try to get any remote
        remote_url=$(git remote -v | head -1 | awk '{print $2}')
    fi
    
    if [[ -z "${remote_url}" ]]; then
        log_info "No git remote found, will use gh CLI default repository"
        return 0
    fi
    
    # Parse remote URL to extract owner/repo
    # Remove .git suffix
    local clean_url
    clean_url="${remote_url%.git}"
    
    # Extract owner/repo based on URL format
    if [[ "${clean_url}" =~ ^https?://github\.com/ ]]; then
        # GitHub HTTPS URL: https://github.com/owner/repo
        repo="${clean_url#https://github.com/}"
        repo="${repo#http://github.com/}"
    elif [[ "${clean_url}" =~ ^git@github\.com: ]]; then
        # GitHub SSH URL: git@github.com:owner/repo
        repo="${clean_url#*:}"
    elif [[ "${clean_url}" =~ ^https?:// ]]; then
        # Generic HTTPS URL
        repo=$(echo "${clean_url}" | sed -E 's|^[^:/]+[:/]+||')
    elif [[ "${clean_url}" =~ ^git@[^:]+: ]]; then
        # Generic SSH URL
        repo="${clean_url#*:}"
    else
        log_info "Unable to parse remote URL: ${remote_url}"
        return 0
    fi
    
    echo "${repo}"
    return 0
}

install_dependencies() {
    local repo_root="${SCRIPT_DIR}/.."
    
    log_info "Upgrading bun to latest version..."
    bun upgrade || return 1
    
    log_info "Installing dependencies in project root..."
    (cd "${repo_root}" && bun i) || return 1
    
    log_info "Installing dependencies in packages/opencode..."
    (cd "${repo_root}/packages/opencode" && bun i) || return 1
    
    log_info "Dependencies installed successfully"
}

build_packages() {
    local version="$1"
    local repo="$2"
    local repo_root
    local intermediate_dir
    # Use global SCRIPT_DIR set at script start
    repo_root="${SCRIPT_DIR}/.."
    intermediate_dir="${SCRIPT_DIR}/intermediate"
    
    log_info "Starting build process..."
    
    # Build packages/opencode
    log_info "Building packages/opencode..."
    cd "${repo_root}/packages/opencode" || {
        log_error "Failed to cd to packages/opencode"
        return 1
    }
    
    # Build with environment variables - only set GH_REPO if repo is not empty
    if [[ -n "${repo}" ]]; then
        OPENCODE_VERSION="${version}" OPENCODE_RELEASE=true OPENCODE_CHANNEL=prod GH_REPO="${repo}" bun run script/build.ts || {
            log_error "Failed to build packages/opencode"
            log_info "Build log may contain more details"
            return 1
        }
    else
        OPENCODE_VERSION="${version}" OPENCODE_RELEASE=true OPENCODE_CHANNEL=prod bun run script/build.ts || {
            log_error "Failed to build packages/opencode"
            log_info "Build log may contain more details"
            return 1
        }
    fi
    
    # Build packages/app
    log_info "Building packages/app..."
    cd "${repo_root}/packages/app" || {
        log_error "Failed to cd to packages/app"
        return 1
    }
    bun run build || {
        log_error "Failed to build packages/app"
        log_info "Build log may contain more details"
        return 1
    }
    log_info "packages/app build succeeded"
    
    # Create zip from packages/app/dist
    log_info "Creating opencode-web.zip from packages/app/dist..."
    if [[ -d "${repo_root}/packages/app/dist" ]]; then
        cd "${repo_root}/packages/app"
        # Use a temporary directory to get the right directory name in the archive
        local tmp_dir
        tmp_dir=$(mktemp -d)
        mkdir -p "${tmp_dir}/opencode-web"
        cp -r dist/* "${tmp_dir}/opencode-web/"
        cd "${tmp_dir}"
        zip -rq "${intermediate_dir}/opencode-web.zip" opencode-web/
        cd "${repo_root}/packages/app"
        rm -rf "${tmp_dir}"
        log_info "Created: opencode-web.zip"
    else
        log_info "Warning: packages/app/dist not found, skipping opencode-web.zip"
    fi
    
    # Prepare intermediate directory
    log_info "Preparing intermediate directory..."
    mkdir -p "${intermediate_dir}"
    cd "${intermediate_dir}"
    
    # Copy tar.gz files from packages/opencode/dist
    log_info "Copying build artifacts to intermediate directory..."
    for file in "${repo_root}/packages/opencode/dist"/*.tar.gz "${repo_root}/packages/opencode/dist"/*.zip; do
        if [[ -f "${file}" ]]; then
            cp "${file}" .
            log_info "Copied: $(basename "${file}")"
        fi
    done
    
    # Generate checksums.txt
    log_info "Generating checksums.txt..."
    if command -v shasum &> /dev/null; then
        # macOS uses shasum
        shasum -a 256 *.tar.gz *.zip 2>/dev/null > checksums.txt
    elif command -v sha256sum &> /dev/null; then
        # Linux uses sha256sum
        sha256sum *.tar.gz *.zip 2>/dev/null > checksums.txt
    else
        log_error "Neither shasum nor sha256sum found"
        return 1
    fi
    
    log_info "Checksums generated:"
    cat checksums.txt
    
    log_info "All builds completed successfully"
    return 0
}

# Release functions

check_release_exists() {
    local version="$1"
    local repo="$2"
    # Ensure version has 'v' prefix for gh commands
    if [[ ! "${version}" =~ ^v ]]; then
        version="v${version}"
    fi
    
    local repo_arg
    repo_arg=$(build_gh_repo_arg "${repo}")
    if gh ${repo_arg} release view "${version}" &> /dev/null; then
        log_error "Release ${version} already exists\nPlease use a different version or delete the existing release first with: gh release delete ${version} --yes"
        return 1
    fi
    log_info "Release ${version} does not exist (good)"
}

create_empty_release() {
    local version="$1"
    local repo="$2"
    local release_title
    
    # Ensure version has 'v' prefix
    if [[ ! "${version}" =~ ^v ]]; then
        version="v${version}"
    fi
    
    # Set release title
    release_title="OpenCode ${version}"
    
    local repo_arg
    repo_arg=$(build_gh_repo_arg "${repo}")
    # Create release without files
    log_info "Creating empty release ${version} with title '${release_title}'..."
    if ! gh ${repo_arg} release create "${version}" \
        --title "${release_title}" \
        --notes "" \
        --prerelease=false; then
        log_error "Failed to create release ${version}"
        return 1
    fi
    
    log_info "Empty release ${version} created successfully"
    return 0
}

create_release() {
    local version="$1"
    local repo="$2"
    local release_title
    local intermediate_dir
    
    # Use global SCRIPT_DIR set at script start
    intermediate_dir="${SCRIPT_DIR}/intermediate"
    # Ensure version has 'v' prefix
    if [[ ! "${version}" =~ ^v ]]; then
        version="v${version}"
    fi
    
    # Check if intermediate directory exists
    if [[ ! -d "${intermediate_dir}" ]]; then
        log_error "Intermediate directory not found: ${intermediate_dir}\nPlease run the build script to generate packages first"
        return 1
    fi
    
    # Check if checksums.txt exists
    if [[ ! -f "${intermediate_dir}/checksums.txt" ]]; then
        log_error "checksums.txt not found in ${intermediate_dir}\nPlease run the build script to generate checksums first"
        return 1
    fi
    
    # Check if there are tar.gz files
    local tar_count
    tar_count=$(find "${intermediate_dir}" -name "*.tar.gz" | wc -l)
    if [[ ${tar_count} -eq 0 ]]; then
        log_error "No tar.gz files found in ${intermediate_dir}\nPlease run the build script to generate packages first"
        return 1
    fi
    log_info "Found ${tar_count} package tar.gz files"
    
    # Set release title
    release_title="OpenCode ${version}"
    
    local repo_arg
    repo_arg=$(build_gh_repo_arg "${repo}")
    # Create release without files first
    log_info "Creating release ${version} with title '${release_title}'..."
    if ! gh ${repo_arg} release create "${version}" \
        --title "${release_title}" \
        --notes "" \
        --prerelease=false; then
        log_error "Failed to create release ${version}"
        return 1
    fi
    
    # Now upload all files from intermediate directory
    log_info "Uploading files to release ${version}..."
    if ! gh ${repo_arg} release upload "${version}" \
        --clobber \
        "${intermediate_dir}"/*.tar.gz \
        "${intermediate_dir}"/*.zip \
        "${intermediate_dir}/checksums.txt"; then
        log_error "Failed to upload files to release ${version}"
        return 1
    fi
    log_info "Release ${version} created and files uploaded successfully"
    return 0
}

verify_release() {
    local version="$1"
    local repo="$2"
    # 12 binary packages (6 tar.gz + 6 zip) + 1 opencode-web.zip + 1 checksums.txt
    local expected_assets=14
    
    # Ensure version has 'v' prefix
    if [[ ! "${version}" =~ ^v ]]; then
        version="v${version}"
    fi
    
    log_info "Verifying release ${version}..."
    
    # Build repo_arg - handle empty repo case properly
    local repo_arg=""
    if [[ -n "${repo}" ]]; then
        repo_arg="-R ${repo}"
    fi
    
    # Check if release exists
    if ! gh ${repo_arg} release view "${version}" &> /dev/null; then
        log_error "Release ${version} does not exist"
        return 1
    fi
    
    # Get release info in one call for efficiency
    local release_json
    release_json=$(gh ${repo_arg} release view "${version}" --json url,name,isPrerelease,isDraft,assets)
    local release_url
    local release_title
    local is_prerelease
    local is_draft
    local asset_count
    
    release_url=$(echo "${release_json}" | jq -r '.url')
    release_title=$(echo "${release_json}" | jq -r '.name')
    is_prerelease=$(echo "${release_json}" | jq -r '.isPrerelease')
    is_draft=$(echo "${release_json}" | jq -r '.isDraft')
    asset_count=$(echo "${release_json}" | jq '.assets | length')
    
    log_info "Release URL: ${release_url}"
    log_info "Release title: ${release_title}"
    log_info "Assets count: ${asset_count}"
    
    # Verify it's not a draft or pre-release
    if [[ "${is_draft}" == "true" ]]; then
        log_error "Release ${version} is marked as draft (should be published)"
        return 1
    fi
    
    if [[ "${is_prerelease}" == "true" ]]; then
        log_error "Release ${version} is marked as pre-release (should be published)"
        return 1
    fi
    
    # Verify asset count
    if [[ ${asset_count} -ne ${expected_assets} ]]; then
        log_error "Expected ${expected_assets} assets, but found ${asset_count}"
        return 1
    fi
    
    log_info "Release ${version} verified successfully"
    log_info "Release URL: ${release_url}"
    return 0
}

# Main

main() {
    local version=""
    local validate_only=false
    local repo=""


    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run|--validate)
                validate_only=true
                shift
                ;;

            --repo)
                repo="$2"
                shift
                shift
                ;;
            -h|--help)
    echo "Usage: $0 [VERSION] [--repo REPO] [options]"
    echo ""
    echo "  VERSION    Release version (e.g., v1.2.16, 1.2.16)"
    echo "             If not provided, auto-calculates fork version:"
    echo "               1. Read latest GitHub release, restore official version"
    echo "               2. Compare with packages/opencode/package.json version"
    echo "               3. If equal: increment build count (thousands digit)"
    echo "               4. If newer: start from base (patch + 100000)"
    echo "               5. If older: error and exit"
    echo "             Formula: patch + 100000 + (build_count * 1000)"
    echo "             Example: official 1.3.99 -> 1.3.100099, 1.3.101099..."
    echo ""
    echo "Options:"
    echo "  --repo REPO    Target repository (e.g., owner/repo, defaults to git remote)"
    echo "  --dry-run      Dry-run mode - calculate version only, no build or release"
    echo "  --validate     Same as --dry-run (legacy alias)"
    echo "  -h, --help     Show this help message"
                exit 0
                ;;

            *)
                if [[ -z "${version}" ]]; then
                    version="$1"
                else
                    echo "Usage: $0 <VERSION> [--repo REPO] [--validate]" >&2
                    echo "Run '$0 --help' for more information" >&2
                    log_error "Unknown argument: $1"
                fi
                shift
                ;;
        esac
    done

    check_gh_cli
    check_gh_auth

    if [[ -z "${repo}" ]]; then
        repo=$(detect_git_repo)
        if [[ -n "${repo}" ]]; then
            log_info "Auto-detected repository: ${repo}"
        else
            log_info "Using gh CLI default repository"
        fi
    fi

    if [[ -z "${version}" ]]; then
        local package_json="${SCRIPT_DIR}/../packages/opencode/package.json"
        if [[ ! -f "${package_json}" ]]; then
            log_error "package.json not found at ${package_json}"
        fi
        
        local base_version
        base_version=$(jq -r '.version' "${package_json}" 2>/dev/null)
        if [[ -z "${base_version}" || "${base_version}" == "null" ]]; then
            log_error "Failed to read version from ${package_json}"
        fi
        
        version=$(find_next_version "${base_version}" "${repo}")
        log_info "Auto-generated version from package.json: ${version}"
    fi

    log_info "Starting validation..."
    validate_version "${version}"
    log_info "All validations passed"

    # If validate_only mode, exit early
    if [[ "${validate_only}" == true ]]; then
        log_info "Validation complete (dry-run mode)"
        exit 0
    fi

    # Create empty release first (before build, so TypeScript script can upload)
    log_info "Creating empty release..."
    check_release_exists "${version}" "${repo}"
    create_empty_release "${version}" "${repo}"

    install_dependencies

    # Build packages (TypeScript script will upload files now)
    build_packages "${version}" "${repo}"

    # Upload additional files (opencode-web and checksums)
    # Note: build.ts already uploaded the binary packages, we only upload what's missing
    log_info "Uploading additional files to release..."
    local intermediate_dir="${SCRIPT_DIR}/intermediate"
    
    # Build repo_arg - handle empty repo case
    local repo_arg=""
    if [[ -n "${repo}" ]]; then
        repo_arg="-R ${repo}"
    fi
    
    # Upload opencode-web.zip and checksums.txt (binaries already uploaded by build.ts)
    local files_to_upload=()
    if [[ -f "${intermediate_dir}/opencode-web.zip" ]]; then
        files_to_upload+=("${intermediate_dir}/opencode-web.zip")
    fi
    if [[ -f "${intermediate_dir}/checksums.txt" ]]; then
        files_to_upload+=("${intermediate_dir}/checksums.txt")
    fi
    
    if [[ ${#files_to_upload[@]} -gt 0 ]]; then
        log_info "Uploading: ${files_to_upload[*]}"
        if ! gh ${repo_arg} release upload "v${version}" \
            --clobber \
            "${files_to_upload[@]}"; then
            log_error "Failed to upload additional files to release"
            return 1
        fi
        log_info "Additional files uploaded successfully"
    else
        log_info "No additional files to upload"
    fi

    # Verify release
    verify_release "${version}" "${repo}"
    log_info "Release creation complete!"
}

main "$@"
