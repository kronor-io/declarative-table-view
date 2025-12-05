import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Typography from '@mui/material/Typography';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';

interface CustomPaginationProps {
    currentPage: number;
    rowsPerPage: number;
    rowsPerPageOptions: number[];
    hasNextPage: boolean;
    hasPrevPage: boolean;
    actualRows: number;
    onPageChange: () => void;
    onPrevPage: () => void;
    onRowsPerPageChange: (value: number) => void;
}

export default function CustomPagination({
    currentPage,
    rowsPerPage,
    rowsPerPageOptions,
    hasNextPage,
    hasPrevPage,
    actualRows,
    onPageChange,
    onPrevPage,
    onRowsPerPageChange
}: CustomPaginationProps) {
    const calculateRowRange = () => {
        if (actualRows === 0) return '0-0';

        const startRow = currentPage * rowsPerPage + 1;
        const endRow = startRow + actualRows - 1;

        return `${startRow}-${endRow}`;
    };

    const rowRange = calculateRowRange();

    return (
        <Box
            sx={{
                width: '100%',
                height: '52px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" color="text.secondary">
                    Rows per page:
                </Typography>
                <FormControl size="small" variant="outlined">
                    <Select
                        value={rowsPerPage}
                        onChange={(e) => onRowsPerPageChange(Number(e.target.value))}
                    >
                        {rowsPerPageOptions.map((option) => (
                            <MenuItem key={option} value={option}>
                                {option}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <IconButton
                    onClick={onPrevPage}
                    disabled={!hasPrevPage}
                    sx={{
                        opacity: hasPrevPage ? 1 : 0.5,
                        cursor: hasPrevPage ? 'pointer' : 'default'
                    }}
                    aria-label="previous page"
                >
                    <KeyboardArrowLeftIcon />
                </IconButton>

                <Typography variant="body2" color="text.secondary">
                    {rowRange}
                </Typography>

                <IconButton
                    onClick={onPageChange}
                    disabled={!hasNextPage}
                    size="small"
                    sx={{
                        opacity: hasNextPage ? 1 : 0.5,
                        cursor: hasNextPage ? 'pointer' : 'default'
                    }}
                    aria-label="next page"
                >
                    <KeyboardArrowRightIcon />
                </IconButton>
            </Box>
        </Box>
    );
}