import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Typography from '@mui/material/Typography';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import Grid from '@mui/material/Grid';

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
    const iconButtonStyles = (enabled: boolean) => ({
        backgroundColor: enabled ? '#6c9dcc' : '#b3c8d4',
        color: 'white',
        '&:hover': {
            backgroundColor: enabled ? '#8bb6e2' : '#b3c8d4'
        },
        transition: 'background-color 0.2s ease',
        '&.Mui-disabled': {
            backgroundColor: '#b3c8d4',
            color: 'white',
            opacity: 1
        }
    });
    const boxSx = { display: 'flex', justifyContent: 'left', alignItems: 'center', gap: 1 };

    return (
        <Grid container sx={{ m: 1 }}>
            <Grid size={{ sm: 4 }}>
                <Box sx={boxSx}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: 14 }}>
                        Rows per page:
                    </Typography>
                    <FormControl size="small" variant="outlined">
                        <Select
                            value={rowsPerPage}
                            onChange={(e) => onRowsPerPageChange(Number(e.target.value))}
                        >
                            {rowsPerPageOptions.map((option) => (
                                <MenuItem key={option} value={option} sx={{ fontSize: 14 }}>
                                    {option}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Box>
            </Grid>
            <Grid size={{ sm: 4 }}>
                <Box sx={{ ...boxSx, justifyContent: 'center' }}>
                    <IconButton
                        onClick={onPrevPage}
                        disabled={!hasPrevPage}
                        sx={iconButtonStyles(hasPrevPage)}
                    >
                        <KeyboardArrowLeftIcon />
                    </IconButton>

                    <Typography sx={{ fontSize: 14 }}>{rowRange}</Typography>

                    <IconButton
                        onClick={onPageChange}
                        disabled={!hasNextPage}
                        sx={iconButtonStyles(hasNextPage)}
                    >
                        <KeyboardArrowRightIcon />
                    </IconButton>
                </Box>
            </Grid>

            <Grid size={{ sm: 4 }} />
        </Grid>
    );
}
